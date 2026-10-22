import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCommits, fetchPullRequests, fetchIssues } from "../github/client.js";
import { synthesizeGenerationalMemory } from "../bedrock/synthesizer.js";
import { logAction } from "../db/index.js";

// Keyword search across commits/PRs/issues
function filterByKeywords(
  text: string,
  keywords: string[]
): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function registerMemoryTool(server: McpServer) {
  server.tool(
    "get_generational_memory",
    "Ask any free-form question about the codebase history and get an answer grounded in evidence from commits, pull requests, and issues. The institutional memory of your engineering team.",
    {
      owner: z.string().describe("GitHub repository owner"),
      repo: z.string().describe("GitHub repository name"),
      question: z
        .string()
        .describe(
          "Any question about the codebase history (e.g. 'Why did we change the auth system in 2023?', 'What caused the June outage?', 'When did we add rate limiting?')"
        ),
      keywords: z
        .array(z.string())
        .optional()
        .describe(
          "Optional keywords to focus the search (extracted from the question automatically if not provided)"
        ),
    },
    async ({ owner, repo, question, keywords }) => {
      const start = Date.now();
      const params = { owner, repo, question };

      // Auto-extract keywords from question if not provided
      const searchTerms =
        keywords ??
        question
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !["when", "what", "where", "which", "that", "this", "have", "were", "with", "from", "they", "their"].includes(w))
          .slice(0, 8);

      try {
        const [allCommits, allPRs, allIssues] = await Promise.all([
          fetchCommits(owner, repo, 300),
          fetchPullRequests(owner, repo, 150),
          fetchIssues(owner, repo, 150),
        ]);

        // Filter to relevant items using keywords
        const relevantCommits = allCommits.filter((c) =>
          filterByKeywords(c.message + " " + (c.author ?? ""), searchTerms)
        );

        const relevantPRs = allPRs.filter((pr) =>
          filterByKeywords(pr.title + " " + pr.body, searchTerms)
        );

        const relevantIssues = allIssues.filter((i) =>
          filterByKeywords(i.title + " " + i.body, searchTerms)
        );

        // Fall back to most recent if nothing matched
        const commits =
          relevantCommits.length > 0 ? relevantCommits : allCommits.slice(0, 50);
        const prs = relevantPRs.length > 0 ? relevantPRs : allPRs.slice(0, 20);
        const issues =
          relevantIssues.length > 0 ? relevantIssues : allIssues.slice(0, 20);

        const answer = await synthesizeGenerationalMemory(
          owner,
          repo,
          question,
          commits,
          prs,
          issues
        );

        const evidenceSummary = [
          relevantCommits.length > 0
            ? `${relevantCommits.length} matching commits`
            : null,
          relevantPRs.length > 0 ? `${relevantPRs.length} matching PRs` : null,
          relevantIssues.length > 0
            ? `${relevantIssues.length} matching issues`
            : null,
        ]
          .filter(Boolean)
          .join(", ");

        const result = `# Generational Memory: ${owner}/${repo}\n\n**Question:** ${question}\n\n*Evidence: ${evidenceSummary || "general history"}*\n\n${answer}`;
        logAction("memory", owner, repo, params, Date.now() - start);

        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logAction("memory", owner, repo, params, Date.now() - start, msg);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
