#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getVersion } from './version.js';
import { GitHubClient } from './api/client.js';
import { ScriptExecutor } from './mcp/script-executor.js';
import { GitHubIssue, GitHubMilestone } from './types/github.js';

// Re-export for external use
export { GitHubClient } from './api/client.js';
export { discoverGitHubToken } from './config/token-discovery.js';

export class GitHubMcpServer {
  private server: Server;
  private client: GitHubClient;
  private scriptExecutor: ScriptExecutor;

  constructor() {
    this.server = new Server(
      {
        name: 'gh-mcp',
        version: getVersion(),
        description: `MCP server for GitHub Issues with script execution.

This server exposes a single, powerful tool: 'execute_github_script'.
Write JavaScript code to interact with the GitHub API directly.
Enables complex workflows, batch operations, and agentic behaviors in a single turn.
`,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.client = new GitHubClient();
    this.scriptExecutor = new ScriptExecutor(this.client);
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private async getToolsDefinitions() {
    const { owner, repo } = this.client.getRepoInfo();

    return [
      {
        name: 'execute_github_script',
        description: `Execute JavaScript to manage GitHub issues for ${owner}/${repo}.
API: listIssues(limit?, openOnly?, milestone?), getIssue(number), searchIssues(query), createIssue({...}), updateIssue(number, {...}), getCurrentMilestone(), help().
CRITICAL: When listing issues, ALWAYS return them directly (e.g. 'const ms = await github.getCurrentMilestone(); return github.listIssues(20, true, ms?.title);') and respond ONLY with "Done.". HIDE descriptions unless explicitly asked.
For the full API, examples, and search tips, execute: return github.help();`,
        inputSchema: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description: 'The JavaScript code to execute.',
            },
          },
          required: ['script'],
        },
      },
    ];
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: await this.getToolsDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error('Missing arguments');
      }

      if (name === 'execute_github_script') {
        const script = args.script as string;
        try {
          const result = await this.scriptExecutor.execute(script);

          return {
            content: [{ type: 'text', text: formatResult(result) }],
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (errorMessage.includes('ConfigError')) {
            return {
              content: [{ type: 'text', text: errorMessage }],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Script Execution Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GitHub MCP server (Script Mode) running on stdio');
  }
}

interface ResultWithDisplayOptions {
  data: unknown;
  showBody?: boolean;
}

/**
 * Formats a result from the script executor into a user-friendly string.
 */
export function formatResult(result: unknown): string {
  let data = result;
  let showBody = false;

  if (
    typeof result === 'object' &&
    result !== null &&
    'data' in result &&
    !isGitHubIssue(result) &&
    !isGitHubMilestone(result)
  ) {
    const wrapper = result as ResultWithDisplayOptions;
    data = wrapper.data;
    if (wrapper.showBody !== undefined) {
      showBody = wrapper.showBody;
    }
  }

  if (data === undefined) {
    return 'Script executed successfully (no return value).';
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    const arr = data as unknown[];
    if (arr.length === 0) {
      return 'No items found.';
    }

    const issues = arr.filter(isGitHubIssue);
    if (issues.length === arr.length) {
      return issues.map((i) => formatIssue(i, showBody)).join('\n\n');
    }

    const milestones = arr.filter(isGitHubMilestone);
    if (milestones.length === arr.length) {
      return milestones.map(formatMilestone).join('\n\n');
    }

    if (arr.every((item: unknown) => typeof item === 'string')) {
      return arr.join('\n');
    }
  }

  if (isGitHubIssue(data)) {
    return formatIssue(data, showBody);
  }

  if (isGitHubMilestone(data)) {
    return formatMilestone(data);
  }

  // Handle objects (like Maps turned into objects)
  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data);
    if (
      entries.length > 0 &&
      entries.every(([, v]) => isGitHubIssue(v) || isGitHubMilestone(v))
    ) {
      return entries
        .map(([key, value]) => {
          const formatted = isGitHubIssue(value)
            ? formatIssue(value, showBody)
            : formatMilestone(value as GitHubMilestone);
          return `Key: ${key}\n${formatted}`;
        })
        .join('\n\n---\n\n');
    }
  }

  // Fallback: Pretty-print JSON
  return JSON.stringify(data, null, 2);
}

function isGitHubIssue(obj: unknown): obj is GitHubIssue {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'number' in obj &&
    'title' in obj &&
    'id' in obj &&
    ('url' in obj || 'state' in obj)
  );
}

function isGitHubMilestone(obj: unknown): obj is GitHubMilestone {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'number' in obj &&
    'title' in obj &&
    'id' in obj &&
    !('url' in obj) &&
    !('state' in obj)
  );
}

function formatIssue(issue: GitHubIssue, showBody = true): string {
  let output = `#${issue.number}: ${issue.title}`;

  if (issue.labels?.nodes && issue.labels.nodes.length > 0) {
    const labels = issue.labels.nodes.map((l) => l.name).join(', ');
    output += `\nLabels: ${labels}`;
  }

  if (showBody && issue.body) {
    output += `\n\n${issue.body}`;
  }

  if (issue.subIssues?.nodes && issue.subIssues.nodes.length > 0) {
    const subtasks = issue.subIssues.nodes
      .map((si) => `  - #${si.number}: ${si.title}`)
      .join('\n');
    output += `\nSubtasks:\n${subtasks}`;
  }

  return output;
}

function formatMilestone(ms: GitHubMilestone): string {
  let output = `Milestone #${ms.number}: ${ms.title}`;
  if (ms.description) {
    output += `\n${ms.description}`;
  }
  return output;
}
