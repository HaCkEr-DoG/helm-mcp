import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCommits, fetchCommitsByAuthor } from "../github/client.js";
import { synthesizeDepartureImpact } from "../bedrock/synthesizer.js";
import { getCached, setCached, logAction } from "../db/index.js";

export function registerDepartureTool(server: McpServer) {
  server.tool(
    "get_departure_impact",
    "Score the knowledge risk when an engineer leaves. Identifies critical vs manageable knowledge loss, bus-factor risks, and prioritized knowledge transfer recommendations.",
    {
      owner: z.string().describe("GitHub repository owner"),
      repo: z.string().describe("GitHub repository name"),
      engineer: z
        .string()
        .describe("GitHub username of the departing engineer"),
    },
    async ({ owner, repo, engineer }) => {
      const start = Date.now();
      const params = { owner, repo, engineer };

      const cached = getCached(owner, repo, "departure", params);
      if (cached) {
        return {
          content: [{ type: "text", text: `[Cached]\n\n${cached}` }],
        };
      }

      try {
        const [engineerCommits, allCommits] = await Promise.all([
          fetchCommitsByAuthor(owner, repo, engineer, 300),
          fetchCommits(owner, repo, 100),
        ]);

        if (engineerCommits.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No commits found for ${engineer} in ${owner}/${repo}. Verify the GitHub username.`,
              },
            ],
          };
        }

        const impact = await synthesizeDepartureImpact(
          owner,
          repo,
          engineer,
          engineerCommits,
          allCommits
        );

        const result = `# Departure Impact Assessment: ${engineer}\n\n*Synthesized from ${engineerCommits.length} commits by ${engineer}*\n\n${impact}`;
        setCached(owner, repo, "departure", params, result);
        logAction("departure", owner, repo, params, Date.now() - start);

        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logAction("departure", owner, repo, params, Date.now() - start, msg);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
