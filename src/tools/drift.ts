import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCommits, fetchPullRequests } from "../github/client.js";
import { synthesizeIntentDrift } from "../bedrock/synthesizer.js";
import { getCached, setCached, logAction } from "../db/index.js";

export function registerDriftTool(server: McpServer) {
  server.tool(
    "get_intent_drift",
    "Compare a module's original design intent with its current reality. Identifies architectural drift, accumulated workarounds, and what the module has become vs what it was designed to be.",
    {
      owner: z.string().describe("GitHub repository owner"),
      repo: z.string().describe("GitHub repository name"),
      module_path: z
        .string()
        .describe(
          "Path to the module or directory to analyze (e.g. 'src/auth', 'lib/payments')"
        ),
    },
    async ({ owner, repo, module_path }) => {
      const start = Date.now();
      const params = { owner, repo, module_path };

      const cached = getCached(owner, repo, "drift", params);
      if (cached) {
        return {
          content: [{ type: "text", text: `[Cached]\n\n${cached}` }],
        };
      }

      try {
        const allCommits = await fetchCommits(owner, repo, 300, module_path);

        if (allCommits.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No commits found touching ${module_path}. Verify the path exists in ${owner}/${repo}.`,
              },
            ],
          };
        }

        // Split into early and recent
        const sorted = allCommits.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const earlyCommits = sorted.slice(0, Math.min(30, Math.floor(sorted.length / 3)));
        const recentCommits = sorted.slice(-Math.min(30, Math.floor(sorted.length / 3)));

        const prs = await fetchPullRequests(owner, repo, 100);
        const modulePRs = prs.filter((pr) =>
          pr.files?.some((f) => f.startsWith(module_path))
        );

        const drift = await synthesizeIntentDrift(
          owner,
          repo,
          module_path,
          earlyCommits,
          recentCommits,
          modulePRs
        );

        const result = `# Intent Drift Analysis: ${module_path}\n\n*Based on ${allCommits.length} commits (earliest ${earlyCommits.length} vs most recent ${recentCommits.length})*\n\n${drift}`;
        setCached(owner, repo, "drift", params, result);
        logAction("drift", owner, repo, params, Date.now() - start);

        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logAction("drift", owner, repo, params, Date.now() - start, msg);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
