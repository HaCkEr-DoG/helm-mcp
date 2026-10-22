import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCommits, fetchPullRequests } from "../github/client.js";
import { synthesizeBiography } from "../bedrock/synthesizer.js";
import { getCached, setCached, logAction } from "../db/index.js";

export function registerBiographyTool(server: McpServer) {
  server.tool(
    "get_codebase_biography",
    "Generate a narrative biography of how a codebase evolved over time — its phases, inflection points, and current trajectory. Answers: what has this system been through?",
    {
      owner: z.string().describe("GitHub repository owner"),
      repo: z.string().describe("GitHub repository name"),
      force_refresh: z
        .boolean()
        .optional()
        .describe("Bypass cache and regenerate"),
    },
    async ({ owner, repo, force_refresh }) => {
      const start = Date.now();
      const params = { owner, repo };

      if (!force_refresh) {
        const cached = getCached(owner, repo, "biography", params);
        if (cached) {
          return {
            content: [{ type: "text", text: `[Cached]\n\n${cached}` }],
          };
        }
      }

      try {
        const [commits, prs] = await Promise.all([
          fetchCommits(owner, repo, 200),
          fetchPullRequests(owner, repo, 80),
        ]);

        if (commits.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No commits found for ${owner}/${repo}. Check repository access.`,
              },
            ],
          };
        }

        const biography = await synthesizeBiography(owner, repo, commits, prs);
        setCached(owner, repo, "biography", params, biography);
        logAction("biography", owner, repo, params, Date.now() - start);

        return {
          content: [
            {
              type: "text",
              text: `# Codebase Biography: ${owner}/${repo}\n\n*Synthesized from ${commits.length} commits and ${prs.length} pull requests*\n\n${biography}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logAction("biography", owner, repo, params, Date.now() - start, msg);
        return {
          content: [{ type: "text", text: `Error generating biography: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
