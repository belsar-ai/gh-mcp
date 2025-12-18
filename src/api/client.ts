import * as fs from 'node:fs';
import * as path from 'node:path';
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
const CACHE_DIR = '.mcp-config';
const CACHE_FILE = 'gh-mcp-cache.json';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheSchema {
  repoKey: string;
  timestamp: number;
  data: {
    repositoryId: string;
    projectId: string | null;
    labels: Record<string, string>;
    milestones: Record<string, string>;
    issueTypes: Record<string, string>;
  };
}

/**
 * GitHub GraphQL API Client
 */
export class GitHubClient {
  private token: string | null = null;
  private config: GhMcpConfig | null = null;
  private contextCache: ContextData | null = null;

  constructor() {
    // Lazy initialization - don't load or check anything in constructor
  }

  /**
   * Get the GitHub token, trying to discover it if missing.
   * Throws ConfigError if not found.
   */
  private getToken(): string {
    if (!this.token) {
      this.token = discoverGitHubToken();
    }

    if (!this.token) {
      throw new ConfigError(
        'GitHub token not found. Please set the GITHUB_MCP_PAT environment variable, ' +
          'or add GITHUB_MCP_PAT to your ~/.gemini/.env file.',
      );
    }

    return this.token;
  }

  /**
   * Get the current config, trying to load it if missing.
   * Throws ConfigError if still not found.
   */
  private getConfig(): GhMcpConfig {
    if (!this.config) {
      this.config = loadConfig();
    }

    if (!this.config) {
      throw new ConfigError(
        "Not currently in a repository with a '.mcp-config/gh-mcp.toml' configuration.\n" +
          "To use this tool here, please create '.mcp-config/gh-mcp.toml' with:\n\n" +
          '```toml\n' +
          '[repo]\n' +
          'organization = "<OWNER>"\n' +
          'repository = "<REPO>"\n' +
          '```',
      );
    }

    return this.config;
  }

  private getCachePath(): string {
    return path.join(process.cwd(), CACHE_DIR, CACHE_FILE);
  }

  private getRepoKey(): string {
    const { owner, repo } = this.getRepoInfo();
    return `${owner}/${repo}`;
  }

  private loadCacheFromDisk(): void {
    try {
      const cachePath = this.getCachePath();
      if (fs.existsSync(cachePath)) {
        const content = fs.readFileSync(cachePath, 'utf-8');
        const cache = JSON.parse(content) as CacheSchema;

        // Validate Cache
        const isExpired = Date.now() - cache.timestamp > CACHE_TTL_MS;
        const isDifferentRepo = cache.repoKey !== this.getRepoKey();

        if (isExpired || isDifferentRepo) {
          return;
        }

        this.contextCache = {
          repositoryId: cache.data.repositoryId,
          projectId: cache.data.projectId,
          labels: new Map(Object.entries(cache.data.labels)),
          milestones: new Map(Object.entries(cache.data.milestones)),
          issueTypes: new Map(Object.entries(cache.data.issueTypes)),
        };
      }
    } catch {
      // Ignore cache load errors, proceed to fetch fresh
      console.error(
        '[Info] Failed to load cache from disk, fetching fresh data.',
      );
    }
  }

  private saveCacheToDisk(): void {
    if (!this.contextCache) return;

    try {
      const cachePath = this.getCachePath();
      const dirPath = path.dirname(cachePath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const cache: CacheSchema = {
        repoKey: this.getRepoKey(),
        timestamp: Date.now(),
        data: {
          repositoryId: this.contextCache.repositoryId,
          projectId: this.contextCache.projectId,
          labels: Object.fromEntries(this.contextCache.labels),
          milestones: Object.fromEntries(this.contextCache.milestones),
          issueTypes: Object.fromEntries(this.contextCache.issueTypes),
        },
      };

      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    } catch (error) {
      console.error('[Warning] Failed to save cache to disk:', error);
    }
  }

  /**
   * Execute a GraphQL query/mutation
   */
  private async execute<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const token = this.getToken();
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
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
    const config = this.getConfig();
    return {
      owner: config.repo.organization,
      repo: config.repo.repository,
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

    if (!forceRefresh) {
      this.loadCacheFromDisk();
      if (this.contextCache) {
        return this.contextCache;
      }
    }

    const { owner, repo } = this.getRepoInfo();
    const config = this.getConfig();
    const configProject = config.project;
    const withProject = !!configProject;

    // Resolve project number if only name is provided
    let projectNumber = configProject?.number;
    if (withProject && !projectNumber && configProject.name) {
      const resolved = await this.resolveProject(owner, configProject.name);
      projectNumber = resolved.number;
      // Update config with resolved number for future use in this session
      configProject.number = projectNumber;
    }

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
      projectNumber: projectNumber || 0,
      withProject: !!projectNumber,
    });

    const repoData = result.repository;

    let projectId: string | null = null;
    if (projectNumber) {
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

    this.saveCacheToDisk();

    return this.contextCache;
  }

  /**
   * Resolve a project ID and number by its name
   */
  private async resolveProject(
    owner: string,
    projectName: string,
  ): Promise<{ id: string; number: number }> {
    let after: string | null = null;

    interface ListProjectsResponse {
      organization: {
        projectsV2: {
          nodes: Array<{ id: string; number: number; title: string }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    }

    while (true) {
      const result: ListProjectsResponse =
        await this.execute<ListProjectsResponse>(queries.LIST_PROJECTS, {
          owner,
          after,
        });

      const projects = result.organization.projectsV2;
      const match = projects.nodes.find(
        (p) => p.title.toLowerCase() === projectName.toLowerCase(),
      );

      if (match) {
        return { id: match.id, number: match.number };
      }

      if (!projects.pageInfo.hasNextPage) {
        break;
      }
      after = projects.pageInfo.endCursor;
    }

    throw new ConfigError(
      `Project with name "${projectName}" not found in organization "${owner}"`,
    );
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
    const config = this.getConfig();

    // Resolve label IDs
    const labelIds: string[] = [];
    for (const name of opts.labels || []) {
      const id = context.labels.get(name);
      if (id) labelIds.push(id);
    }

    // Resolve milestone ID
    let milestoneId: string | undefined;
    const milestoneName = opts.milestone || config.project?.current_milestone;
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
    const config = this.getConfig();
    return config.project?.current_milestone;
  }
}
