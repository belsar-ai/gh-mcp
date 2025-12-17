import { loadConfig } from '../config.js';
import { discoverGitHubToken } from '../config/token-discovery.js';
import type {
  GhMcpConfig,
  ContextData,
  GitHubIssue,
  GraphQLResponse,
} from '../types/github.js';
import { ConfigError } from '../types/github.js';
import * as queries from './queries.js';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

/**
 * GitHub GraphQL API Client
 */
export class GitHubClient {
  private token: string;
  private config: GhMcpConfig;
  private contextCache: ContextData | null = null;

  constructor() {
    const token = discoverGitHubToken();
    if (!token) {
      throw new ConfigError(
        'GitHub token not found. Set GITHUB_MCP_PAT environment variable, ' +
          'or add GITHUB_MCP_PAT to ~/.gemini/.env',
      );
    }
    this.token = token;
    this.config = loadConfig();
  }

  /**
   * Execute a GraphQL query/mutation
   */
  private async execute<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'gh-mcp/0.1.0',
      },
      body: JSON.stringify({ query, variables: variables || {} }),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors?.length) {
      const messages = result.errors.map((e) => e.message).join('; ');
      throw new Error(`GraphQL Error: ${messages}`);
    }

    return result.data;
  }

  /**
   * Get the current authenticated user
   */
  async getViewer(): Promise<string> {
    const result = await this.execute<{ viewer: { login: string } }>(
      queries.GET_VIEWER,
    );
    return result.viewer.login;
  }

  /**
   * Get repository owner and name from config
   */
  getRepoInfo(): { owner: string; repo: string } {
    return {
      owner: this.config.repo.organization,
      repo: this.config.repo.repository,
    };
  }

  /**
   * List issues from the repository
   */
  async listIssues(limit = 10, openOnly = true): Promise<GitHubIssue[]> {
    const { owner, repo } = this.getRepoInfo();
    const result = await this.execute<{
      repository: { issues: { nodes: GitHubIssue[] } };
    }>(queries.GET_ISSUES, {
      owner,
      repo,
      first: limit,
      states: openOnly ? ['OPEN'] : null,
    });
    return result.repository.issues.nodes;
  }

  /**
   * Get a single issue by number
   */
  async getIssue(number: number): Promise<GitHubIssue | null> {
    const { owner, repo } = this.getRepoInfo();
    const result = await this.execute<{
      repository: { issue: GitHubIssue | null };
    }>(queries.GET_ISSUE, { owner, repo, number });
    return result.repository.issue;
  }

  /**
   * Get issue ID by number
   */
  async getIssueId(number: number): Promise<string> {
    const { owner, repo } = this.getRepoInfo();
    const result = await this.execute<{
      repository: { issue: { id: string } | null };
    }>(queries.GET_ISSUE_ID, { owner, repo, number });

    if (!result.repository.issue) {
      throw new ConfigError(`Issue #${number} not found`);
    }
    return result.repository.issue.id;
  }

  /**
   * Search issues using GitHub search syntax
   */
  async searchIssues(query: string): Promise<GitHubIssue[]> {
    const { owner, repo } = this.getRepoInfo();
    const fullQuery = `repo:${owner}/${repo} ${query}`;
    const result = await this.execute<{
      search: { nodes: GitHubIssue[] };
    }>(queries.SEARCH_ISSUES, { query: fullQuery });
    return result.search.nodes.filter((n) => n !== null);
  }

  /**
   * Get context IDs (repository, labels, milestones, issue types, project)
   * This is cached for efficiency.
   */
  async getContextIds(forceRefresh = false): Promise<ContextData> {
    if (this.contextCache && !forceRefresh) {
      return this.contextCache;
    }

    const { owner, repo } = this.getRepoInfo();
    const projectNumber = this.config.project?.number || 0;
    const withProject = !!this.config.project;

    const result = await this.execute<{
      repository: {
        id: string;
        labels: { nodes: Array<{ id: string; name: string }> };
        milestones: { nodes: Array<{ id: string; title: string }> };
        issueTypes?: { nodes: Array<{ id: string; name: string }> };
      };
      organization?: {
        projectV2: { id: string } | null;
      };
    }>(queries.GET_CONTEXT_IDS, {
      owner,
      repo,
      projectNumber,
      withProject,
    });

    const repoData = result.repository;

    let projectId: string | null = null;
    if (withProject) {
      const orgData = result.organization;
      if (!orgData?.projectV2) {
        throw new ConfigError(
          `Project #${projectNumber} not found in org ${owner}`,
        );
      }
      projectId = orgData.projectV2.id;
    }

    const labels = new Map<string, string>();
    for (const label of repoData.labels.nodes) {
      labels.set(label.name, label.id);
    }

    const milestones = new Map<string, string>();
    for (const ms of repoData.milestones.nodes) {
      milestones.set(ms.title, ms.id);
    }

    const issueTypes = new Map<string, string>();
    if (repoData.issueTypes?.nodes) {
      for (const it of repoData.issueTypes.nodes) {
        issueTypes.set(it.name, it.id);
      }
    }

    this.contextCache = {
      repositoryId: repoData.id,
      projectId,
      labels,
      milestones,
      issueTypes,
    };

    return this.contextCache;
  }

  /**
   * Create a new issue
   */
  async createIssue(opts: {
    title: string;
    body?: string;
    labels?: string[];
    milestone?: string;
    issueType?: string;
    parentIssueId?: string;
  }): Promise<GitHubIssue> {
    const context = await this.getContextIds();

    // Resolve label IDs
    const labelIds: string[] = [];
    for (const name of opts.labels || []) {
      const id = context.labels.get(name);
      if (id) labelIds.push(id);
    }

    // Resolve milestone ID
    let milestoneId: string | undefined;
    const milestoneName =
      opts.milestone || this.config.project?.current_milestone;
    if (milestoneName) {
      milestoneId = context.milestones.get(milestoneName);
    }

    // Resolve issue type ID (case-insensitive)
    let issueTypeId: string | undefined;
    if (opts.issueType) {
      issueTypeId = context.issueTypes.get(opts.issueType);
      if (!issueTypeId) {
        // Try case-insensitive match
        for (const [name, id] of context.issueTypes) {
          if (name.toLowerCase() === opts.issueType.toLowerCase()) {
            issueTypeId = id;
            break;
          }
        }
      }
    }

    const result = await this.execute<{
      createIssue: { issue: GitHubIssue };
    }>(queries.CREATE_ISSUE, {
      repoId: context.repositoryId,
      title: opts.title,
      body: opts.body || '',
      labelIds: labelIds.length > 0 ? labelIds : null,
      milestoneId: milestoneId || null,
      issueTypeId: issueTypeId || null,
      parentIssueId: opts.parentIssueId || null,
    });

    const issue = result.createIssue.issue;

    // Add to project if configured
    if (context.projectId) {
      await this.execute(queries.ADD_TO_PROJECT, {
        projectId: context.projectId,
        contentId: issue.id,
      });
    }

    return issue;
  }

  /**
   * Update an existing issue
   */
  async updateIssue(
    number: number,
    opts: { title?: string; body?: string; state?: 'OPEN' | 'CLOSED' },
  ): Promise<GitHubIssue> {
    const issueId = await this.getIssueId(number);

    const result = await this.execute<{
      updateIssue: { issue: GitHubIssue };
    }>(queries.UPDATE_ISSUE, {
      issueId,
      title: opts.title,
      body: opts.body,
      state: opts.state,
    });

    return result.updateIssue.issue;
  }

  /**
   * Delete an issue (and its subtasks)
   */
  async deleteIssue(number: number): Promise<{ deleted: number }> {
    const { owner, repo } = this.getRepoInfo();

    // Find subtasks
    const subtaskQuery = `repo:${owner}/${repo} "Subtask of #${number}" is:issue`;
    const subtaskResult = await this.execute<{
      search: { nodes: Array<{ id: string; number: number }> };
    }>(queries.SEARCH_ISSUES, { query: subtaskQuery });

    let deletedCount = 0;

    // Delete subtasks first
    for (const subtask of subtaskResult.search.nodes) {
      if (subtask?.id) {
        await this.execute(queries.DELETE_ISSUE, { issueId: subtask.id });
        deletedCount++;
      }
    }

    // Delete parent
    const parentId = await this.getIssueId(number);
    await this.execute(queries.DELETE_ISSUE, { issueId: parentId });

    return { deleted: deletedCount + 1 };
  }

  /**
   * Add labels to an issue
   */
  async addLabels(number: number, labelNames: string[]): Promise<void> {
    const context = await this.getContextIds();
    const issueId = await this.getIssueId(number);

    const labelIds: string[] = [];
    for (const name of labelNames) {
      const id = context.labels.get(name);
      if (id) labelIds.push(id);
    }

    if (labelIds.length > 0) {
      await this.execute(queries.ADD_LABELS_TO_ISSUE, { issueId, labelIds });
    }
  }

  /**
   * Remove labels from an issue
   */
  async removeLabels(number: number, labelNames: string[]): Promise<void> {
    const context = await this.getContextIds();
    const issueId = await this.getIssueId(number);

    const labelIds: string[] = [];
    for (const name of labelNames) {
      const id = context.labels.get(name);
      if (id) labelIds.push(id);
    }

    if (labelIds.length > 0) {
      await this.execute(queries.REMOVE_LABELS_FROM_ISSUE, {
        issueId,
        labelIds,
      });
    }
  }

  /**
   * Get available labels
   */
  async getLabels(): Promise<string[]> {
    const context = await this.getContextIds();
    return Array.from(context.labels.keys());
  }

  /**
   * Get available milestones
   */
  async getMilestones(): Promise<string[]> {
    const context = await this.getContextIds();
    return Array.from(context.milestones.keys());
  }

  /**
   * Get available issue types
   */
  async getIssueTypes(): Promise<string[]> {
    const context = await this.getContextIds();
    return Array.from(context.issueTypes.keys());
  }

  /**
   * Get current milestone from config
   */
  getCurrentMilestone(): string | undefined {
    return this.config.project?.current_milestone;
  }
}
