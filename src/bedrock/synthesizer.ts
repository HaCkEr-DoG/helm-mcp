import { spawnSync } from "child_process";
import type { Commit, PullRequest, Issue } from "../github/client.js";

const FAST_MODEL = "claude-cli";
const DEEP_MODEL = "claude-cli";

async function invoke(
  prompt: string,
  _modelId: string,
  _maxTokens = 1500
): Promise<string> {
  // Use claude CLI via stdin — unset ANTHROPIC_API_KEY so the CLI uses OAuth.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_WORKSPACE_ID;
  const result = spawnSync("claude", ["-p", "-"], {
    input: prompt,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `claude exited with code ${result.status}`);
  }
  return result.stdout.trim();
}

// Split commits into chronological eras (quarters) for chunked synthesis
function groupByEra(commits: Commit[]): { era: string; commits: Commit[] }[] {
  const eras = new Map<string, Commit[]>();

  for (const c of commits) {
    if (!c.date) continue;
    const d = new Date(c.date);
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    const key = `${d.getFullYear()}-Q${quarter}`;
    if (!eras.has(key)) eras.set(key, []);
    eras.get(key)!.push(c);
  }

  return Array.from(eras.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([era, commits]) => ({ era, commits }));
}

function formatCommits(commits: Commit[]): string {
  return commits
    .slice(0, 80)
    .map((c) => `[${c.sha}] ${c.date?.slice(0, 10)} - ${c.author}: ${c.message}`)
    .join("\n");
}

function formatPRs(prs: PullRequest[]): string {
  return prs
    .slice(0, 50)
    .map(
      (pr) =>
        `PR #${pr.number} (${pr.merged_at?.slice(0, 10)}): "${pr.title}" by ${pr.author} — ${pr.body.slice(0, 150)}`
    )
    .join("\n");
}

function formatIssues(issues: Issue[]): string {
  return issues
    .slice(0, 50)
    .map(
      (i) =>
        `Issue #${i.number} [${i.labels.join(", ")}] (${i.created_at.slice(0, 10)}): "${i.title}" — ${i.body.slice(0, 100)}`
    )
    .join("\n");
}

export async function synthesizeBiography(
  owner: string,
  repo: string,
  commits: Commit[],
  prs: PullRequest[]
): Promise<string> {
  // Keep at most 8 eras (most recent) so the demo stays fast
  const allEras = groupByEra(commits);
  const eras = allEras.slice(-8);

  // Level 1: summarize each era
  const eraSummaries: string[] = [];
  for (const { era, commits: eraCommits } of eras) {
    if (eraCommits.length === 0) continue;
    const summary = await invoke(
      `You are analyzing the git history of the ${owner}/${repo} repository.

Time period: ${era}
Commits in this period (${eraCommits.length} total):
${formatCommits(eraCommits)}

Write a 2-3 sentence technical narrative of what the team was building or fixing in this period. Be specific about patterns you see. Use commit SHAs as evidence when relevant.`,
      FAST_MODEL,
      400
    );
    eraSummaries.push(`**${era}:** ${summary.trim()}`);
  }

  // Level 2: synthesize era summaries into biography
  const prContext =
    prs.length > 0
      ? `\n\nKey merged pull requests:\n${formatPRs(prs.slice(0, 30))}`
      : "";

  const biography = await invoke(
    `You are writing the organizational biography of the ${owner}/${repo} codebase.

Here is a chronological summary of the repository's evolution by quarter:

${eraSummaries.join("\n\n")}
${prContext}

Write a compelling 4-6 paragraph narrative biography of this codebase. Include:
1. What problem it was originally built to solve
2. The major phases of its evolution
3. What the system has been through (growth, pain points, pivots)
4. The current state and trajectory
5. What the system "wants" — what it keeps asking for through friction patterns

Be specific. Use evidence from the commit history. Write in a way that helps a new engineer understand not just what the system is, but what it has been through.`,
    DEEP_MODEL,
    1800
  );

  return biography;
}

export async function synthesizeIncidentContext(
  owner: string,
  repo: string,
  service: string,
  commits: Commit[],
  issues: Issue[]
): Promise<string> {
  const bugIssues = issues.filter(
    (i) =>
      i.labels.some((l) =>
        ["bug", "incident", "outage", "critical", "hotfix"].includes(
          l.toLowerCase()
        )
      ) ||
      i.title.toLowerCase().includes("incident") ||
      i.title.toLowerCase().includes("outage") ||
      i.title.toLowerCase().includes("hotfix")
  );

  const hotfixCommits = commits.filter(
    (c) =>
      c.message.toLowerCase().includes("hotfix") ||
      c.message.toLowerCase().includes("fix:") ||
      c.message.toLowerCase().includes("urgent") ||
      c.message.toLowerCase().includes("revert") ||
      c.message.toLowerCase().includes("rollback")
  );

  return invoke(
    `You are an experienced on-call engineer helping a junior engineer debug a production incident.

Repository: ${owner}/${repo}
Service/module: ${service}

INCIDENT-RELATED COMMITS in this service:
${formatCommits(hotfixCommits.slice(0, 40))}

INCIDENT-RELATED ISSUES:
${formatIssues(bugIssues.slice(0, 20))}

The engineer is currently experiencing issues with ${service}. Based on this historical data, provide:
1. The most likely root causes based on past incident patterns (with specific commit/issue refs)
2. What fixed it last time (resolution patterns)
3. The estimated time-to-resolve based on historical data
4. Specific things to check first

Be a knowledgeable colleague who has seen this before, not a generic troubleshooting guide. Cite specific evidence.`,
    DEEP_MODEL,
    1200
  );
}

export async function synthesizeDepartureImpact(
  owner: string,
  repo: string,
  engineer: string,
  commits: Commit[],
  allCommits: Commit[]
): Promise<string> {
  // Find files this engineer touched most
  const moduleCount = new Map<string, number>();
  for (const c of commits) {
    if (c.files) {
      for (const f of c.files) {
        const module = f.split("/").slice(0, 2).join("/");
        moduleCount.set(module, (moduleCount.get(module) ?? 0) + 1);
      }
    }
  }

  // Check which of those modules have recent activity from others
  const engineerModules = Array.from(moduleCount.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  return invoke(
    `You are an engineering manager assessing the knowledge risk of ${engineer} leaving the ${owner}/${repo} project.

COMMITS BY ${engineer} (${commits.length} total):
${formatCommits(commits.slice(0, 60))}

Top modules touched by ${engineer}:
${engineerModules.map(([m, n]) => `  ${m}: ${n} commits`).join("\n")}

Recent activity in the repository overall (for comparison):
${formatCommits(allCommits.slice(0, 30))}

Assess the departure impact with:
1. **CRITICAL** modules/areas where ${engineer} appears to be the sole or primary owner (low bus factor)
2. **MANAGEABLE** areas where knowledge appears distributed
3. Specific knowledge that seems tacit (not in docs) based on commit patterns
4. Recommended knowledge transfer priorities (most important first, with time estimates)
5. Departure risk score: LOW / MEDIUM / HIGH / CRITICAL with rationale

Be specific. Cite commit patterns as evidence.`,
    DEEP_MODEL,
    1500
  );
}

export async function synthesizeIntentDrift(
  owner: string,
  repo: string,
  modulePath: string,
  earlyCommits: Commit[],
  recentCommits: Commit[],
  prs: PullRequest[]
): Promise<string> {
  return invoke(
    `You are analyzing architectural drift in the ${modulePath} module of ${owner}/${repo}.

ORIGINAL IMPLEMENTATION (earliest commits):
${formatCommits(earlyCommits)}

RECENT CHANGES (last 3 months):
${formatCommits(recentCommits)}

RELATED PULL REQUESTS:
${formatPRs(prs.slice(0, 15))}

Analyze the intent drift:
1. What was this module originally designed to do? (infer from early commits)
2. What does it actually do now based on recent changes?
3. Where are the gaps between original intent and current reality?
4. What workarounds or patches suggest the original design wasn't meant for current use?
5. What does this module "want" — what refactoring does the pattern of changes suggest is needed?

Be specific. Use commit evidence.`,
    FAST_MODEL,
    1200
  );
}

export async function synthesizeGenerationalMemory(
  owner: string,
  repo: string,
  question: string,
  commits: Commit[],
  prs: PullRequest[],
  issues: Issue[]
): Promise<string> {
  return invoke(
    `You are the institutional memory of the ${owner}/${repo} engineering team. You have access to the full history of this project.

QUESTION: ${question}

RELEVANT COMMITS:
${formatCommits(commits.slice(0, 50))}

RELEVANT PULL REQUESTS:
${formatPRs(prs.slice(0, 20))}

RELEVANT ISSUES:
${formatIssues(issues.slice(0, 20))}

Answer the question as if you were the most experienced engineer on this team — someone who has lived through every decision in this codebase. Be specific. Cite evidence (commit SHAs, PR numbers, issue numbers). If the answer isn't in the history, say so honestly rather than guessing.`,
    DEEP_MODEL,
    1500
  );
}
