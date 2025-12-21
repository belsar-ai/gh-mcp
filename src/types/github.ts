/**
 * GitHub GraphQL API Types
 */

export interface RequiredConfig {
  repo_url: string;
}

export interface OptionalConfig {
  project_name?: string;
  project_number?: number;
  current_milestone?: string;
}

export interface GhMcpConfig {
  required: RequiredConfig;
  optional?: OptionalConfig;
}

export interface ContextData {
  repositoryId: string;
  projectId: string | null;
  labels: Map<string, string>; // Name -> ID
  milestones: Map<string, GitHubMilestone>; // Title -> Milestone object
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
  subIssues?: {
    nodes: Array<{
      id: string;
      number: number;
      title: string;
      state: string;
    }>;
  };
}

export interface GitHubComment {
  author: {
    login: string;
  } | null;
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
}

export interface GitHubPullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  body: string;
  author: {
    login: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  milestone?: {
    title: string;
  } | null;
  labels?: {
    nodes: Array<{ name: string }>;
  };
  comments?: {
    nodes: GitHubComment[];
  };
  reviewThreads?: {
    nodes: Array<{
      comments: {
        nodes: GitHubComment[];
      };
    }>;
  };
}

export interface GitHubLabel {
  id: string;
  name: string;
}

export interface GitHubMilestone {
  id: string;
  title: string;
  number: number;
  description?: string;
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
