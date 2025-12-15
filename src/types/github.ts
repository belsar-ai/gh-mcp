/**
 * GitHub GraphQL API Types
 */

export interface RepoConfig {
  organization: string;
  repository: string;
}

export interface ProjectConfig {
  name?: string;
  number: number;
  current_milestone?: string;
}

export interface GhMcpConfig {
  repo: RepoConfig;
  project?: ProjectConfig;
}

export interface ContextData {
  repositoryId: string;
  projectId: string | null;
  labels: Map<string, string>; // Name -> ID
  milestones: Map<string, string>; // Title -> ID
  issueTypes: Map<string, string>; // Name -> ID
}

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  state?: string;
  body?: string;
  milestone?: {
    title: string;
  } | null;
  labels?: {
    nodes: Array<{ name: string; id?: string }>;
  };
}

export interface GitHubLabel {
  id: string;
  name: string;
}

export interface GitHubMilestone {
  id: string;
  title: string;
}

export interface GitHubIssueType {
  id: string;
  name: string;
}

export interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
