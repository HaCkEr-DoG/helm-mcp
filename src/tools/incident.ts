import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCommits, fetchIssues } from "../github/client.js";
import { synthesizeIncidentContext } from "../bedrock/synthesizer.js";
import { getCached, setCached, logAction } from "../db/index.js";

export function registerIncidentTool(server: McpServer) {
  server.tool(
    "get_incident_context",
    "War-room intelligence: given a service experiencing issues, synthesize all past incidents, root causes, and resolution patterns from the codebase history. Answers: what do we know about past problems here?",
    {
      owner: z.string().describe("GitHub repository owner"),
      repo: z.string().describe("GitHub repository name"),
      service: z
        .string()
        .describe(
          "Service, module, or file path experiencing issues (e.g. 'payments', 'src/auth', 'queue-processor')"
        ),
      description: z
        .string()
        .optional()
        .describe("Brief description of the current symptom"),
    },
    async ({ owner, repo, service, description }) => {
      const start = Date.now();
      const params = { owner, repo, service };

      const cached = getCached(owner, repo, "incident", params);
      if (cached) {
        return {
          content: [{ type: "text", text: `[Cached]\n\n${cached}` }],
        };
      }

      try {
        const [commits, issues] = await Promise.all([
          fetchCommits(owner, repo, 500, service),
          fetchIssues(owner, repo, 200),
        ]);

        const context = await synthesizeIncidentContext(
          owner,
          repo,
          service,
          commits,
          issues
        );

        const header = description
          ? `# Incident Context: ${service}\n\n**Current symptom:** ${description}\n\n`
          : `# Incident Context: ${service}\n\n`;

        const result = `${header}*Synthesized from ${commits.length} commits and ${issues.length} issues*\n\n${context}`;
        setCached(owner, repo, "incident", params, result);
        logAction("incident", owner, repo, params, Date.now() - start);

        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logAction("incident", owner, repo, params, Date.now() - start, msg);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
