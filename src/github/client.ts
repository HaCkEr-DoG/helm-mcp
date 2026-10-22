import { Octokit } from "@octokit/rest";

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  files?: string[];
  additions?: number;
  deletions?: number;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  author: string;
  merged_at: string | null;
  created_at: string;
  files?: string[];
  labels: string[];
  comments_count: number;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  author: string;
  state: string;
  created_at: string;
  closed_at: string | null;
  labels: string[];
}

export interface RepoData {
  commits: Commit[];
  prs: PullRequest[];
  issues: Issue[];
  contributors: { login: string; commits: number }[];
}

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export async function fetchCommits(
  owner: string,
  repo: string,
  limit = 500,
  path?: string
): Promise<Commit[]> {
  const commits: Commit[] = [];
  let page = 1;

  while (commits.length < limit) {
    const batch = Math.min(100, limit - commits.length);
    const { data } = await octokit.repos.listCommits({
      owner,
      repo,
      per_page: batch,
      page,
      ...(path ? { path } : {}),
    });

    if (data.length === 0) break;

    for (const c of data) {
      commits.push({
        sha: c.sha.slice(0, 8),
        message: c.commit.message.split("\n")[0].slice(0, 200),
        author: c.commit.author?.name ?? c.author?.login ?? "unknown",
        date: c.commit.author?.date ?? "",
        additions: c.stats?.additions,
        deletions: c.stats?.deletions,
      });
    }

    if (data.length < batch) break;
    page++;
  }

  return commits;
}

export async function fetchPullRequests(
  owner: string,
  repo: string,
  limit = 200
): Promise<PullRequest[]> {
  const prs: PullRequest[] = [];
  let page = 1;

  while (prs.length < limit) {
    const batch = Math.min(100, limit - prs.length);
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: "closed",
      per_page: batch,
      page,
      sort: "updated",
      direction: "desc",
    });

    if (data.length === 0) break;

    for (const pr of data) {
      if (!pr.merged_at) continue;
      prs.push({
        number: pr.number,
        title: pr.title,
        body: (pr.body ?? "").slice(0, 500),
        author: pr.user?.login ?? "unknown",
        merged_at: pr.merged_at,
        created_at: pr.created_at,
        labels: pr.labels.map((l) => l.name ?? ""),
        comments_count: ((pr as unknown as { comments?: number }).comments ?? 0) + ((pr as unknown as { review_comments?: number }).review_comments ?? 0),
      });
    }

    if (data.length < batch) break;
    page++;
  }

  return prs;
}

export async function fetchIssues(
  owner: string,
  repo: string,
  limit = 200
): Promise<Issue[]> {
  const issues: Issue[] = [];
  let page = 1;

  while (issues.length < limit) {
    const batch = Math.min(100, limit - issues.length);
    const { data } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: "all",
      per_page: batch,
      page,
      sort: "updated",
      direction: "desc",
    });

    if (data.length === 0) break;

    for (const issue of data) {
      if ("pull_request" in issue) continue; // skip PRs
      issues.push({
        number: issue.number,
        title: issue.title,
        body: (issue.body ?? "").slice(0, 300),
        author: issue.user?.login ?? "unknown",
        state: issue.state,
        created_at: issue.created_at,
        closed_at: issue.closed_at ?? null,
        labels: issue.labels.map((l) =>
          typeof l === "string" ? l : (l.name ?? "")
        ),
      });
    }

    if (data.length < batch) break;
    page++;
  }

  return issues;
}

export async function fetchContributors(
  owner: string,
  repo: string
): Promise<{ login: string; commits: number }[]> {
  const { data } = await octokit.repos.listContributors({
    owner,
    repo,
    per_page: 50,
  });
  return data.map((c) => ({
    login: c.login ?? "unknown",
    commits: c.contributions,
  }));
}

export async function fetchCommitsByAuthor(
  owner: string,
  repo: string,
  author: string,
  limit = 300
): Promise<Commit[]> {
  const commits: Commit[] = [];
  let page = 1;

  while (commits.length < limit) {
    const batch = Math.min(100, limit - commits.length);
    const { data } = await octokit.repos.listCommits({
      owner,
      repo,
      author,
      per_page: batch,
      page,
    });

    if (data.length === 0) break;

    for (const c of data) {
      commits.push({
        sha: c.sha.slice(0, 8),
        message: c.commit.message.split("\n")[0].slice(0, 200),
        author: c.commit.author?.name ?? author,
        date: c.commit.author?.date ?? "",
      });
    }

    if (data.length < batch) break;
    page++;
  }

  return commits;
}

export async function fetchCommitDetail(
  owner: string,
  repo: string,
  sha: string
): Promise<string[]> {
  try {
    const { data } = await octokit.repos.getCommit({ owner, repo, ref: sha });
    return (data.files ?? []).map((f) => f.filename);
  } catch {
    return [];
  }
}
