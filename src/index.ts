#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit, SKIP } from 'unist-util-visit';
import { getVersion } from './version.js';
import { GitHubClient } from './api/client.js';
import { ScriptExecutor } from './mcp/script-executor.js';
import {
  GitHubIssue,
  GitHubMilestone,
  GitHubPullRequest,
  GitHubCheckRun,
  GitHubStatusContext,
} from './types/github.js';

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
        description: `Execute JavaScript to manage GitHub for ${owner}/${repo}.

return github.listIssues(limit?, openOnly?, milestone?)  // List issues, filter by milestone
return github.getIssue(number)                           // Get single issue details
return github.getPullRequest(number)                     // Get PR with comments, checks & review threads
return github.getWorkflowLogs(runId)                     // Get logs from failed workflow jobs
return github.searchIssues(query)                        // Search with GitHub syntax
return github.createIssue({title, body?, labels?, milestone?, parentIssueId?})
return github.updateIssue(number, {title?, body?, state?})
return github.getCurrentMilestone()                      // Get default milestone from config
return github.help()                                     // Examples and search tips

Current milestone issues: const ms = await github.getCurrentMilestone(); return github.listIssues(20, true, ms?.title);

CRITICAL: After tool output, respond ONLY with "Done." - no summaries.`,
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

    const prs = arr.filter(isGitHubPullRequest);
    if (prs.length === arr.length) {
      return prs.map(formatPullRequest).join('\n\n---\n\n');
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

  if (isGitHubPullRequest(data)) {
    return formatPullRequest(data);
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
      entries.every(
        ([, v]) =>
          isGitHubPullRequest(v) || isGitHubIssue(v) || isGitHubMilestone(v),
      )
    ) {
      return entries
        .map(([key, value]) => {
          let formatted = '';
          if (isGitHubPullRequest(value)) {
            formatted = formatPullRequest(value);
          } else if (isGitHubIssue(value)) {
            formatted = formatIssue(value, showBody);
          } else {
            formatted = formatMilestone(value as GitHubMilestone);
          }
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
    ('url' in obj || 'state' in obj) &&
    !('author' in obj)
  );
}

function isGitHubPullRequest(obj: unknown): obj is GitHubPullRequest {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'number' in obj &&
    'title' in obj &&
    'id' in obj &&
    'author' in obj &&
    'body' in obj
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
    !('state' in obj) &&
    !('author' in obj)
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

function formatPullRequest(pr: GitHubPullRequest): string {
  let output = `PR #${pr.number}: ${pr.title}\n`;
  output += `State: ${pr.state} | Author: ${
    pr.author?.login || 'ghost'
  } | Created: ${pr.createdAt}\n`;
  output += `URL: ${pr.url}\n`;

  if (pr.labels?.nodes && pr.labels.nodes.length > 0) {
    const labels = pr.labels.nodes.map((l) => l.name).join(', ');
    output += `Labels: ${labels}\n`;
  }

  output += `\n## Description\n${cleanContent(pr.body)}\n`;

  interface FlattenedComment {
    author: string;
    body: string;
    createdAt: string;
    type: string;
    path?: string;
    line?: number;
  }

  const allComments: FlattenedComment[] = [];

  if (pr.comments?.nodes) {
    pr.comments.nodes.forEach((c) => {
      allComments.push({
        author: c.author?.login || 'ghost',
        body: cleanContent(c.body),
        createdAt: c.createdAt,
        type: 'General Comment',
      });
    });
  }

  if (pr.reviewThreads?.nodes) {
    pr.reviewThreads.nodes.forEach((thread) => {
      thread.comments.nodes.forEach((c, index) => {
        allComments.push({
          author: c.author?.login || 'ghost',
          body: cleanContent(c.body),
          createdAt: c.createdAt,
          type: index === 0 ? 'Review Comment' : 'Reply',
          path: c.path,
          line: c.line,
        });
      });
    });
  }

  // Sort comments by date
  allComments.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  if (allComments.length > 0) {
    output += `\n## Comments\n`;
    allComments.forEach((c) => {
      output += `\n---\n`;
      output += `**${c.author}** (${c.type}) at ${c.createdAt}\n`;
      if (c.path) {
        output += `File: ${c.path}:${c.line}\n`;
      }
      output += `\n${c.body}\n`;
    });
  }

  // Add checks section at the end
  const statusCheckRollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  if (statusCheckRollup?.contexts?.nodes?.length) {
    output += `\n## Checks\n`;
    for (const node of statusCheckRollup.contexts.nodes) {
      if ('name' in node) {
        // CheckRun
        const check = node as GitHubCheckRun;
        const icon = check.conclusion === 'SUCCESS' ? '✓' : '✗';
        const status = check.conclusion?.toLowerCase() || 'pending';
        // Extract run ID from detailsUrl (e.g., https://github.com/owner/repo/actions/runs/12345678/job/...)
        const runMatch = check.detailsUrl?.match(/\/runs\/(\d+)/);
        const runInfo = runMatch ? ` → Run ${runMatch[1]}` : '';
        output += `${icon} ${check.name} (${status})${runInfo}\n`;
      } else if ('context' in node) {
        // StatusContext
        const ctx = node as GitHubStatusContext;
        const icon = ctx.state === 'SUCCESS' ? '✓' : '✗';
        output += `${icon} ${ctx.context} (${ctx.state.toLowerCase()})\n`;
      }
    }
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

/**
 * Strips HTML tags and noisy Markdown images from content for cleaner CLI display.
 * Preserves Markdown structure like lists, code blocks, and tables using Remark.
 */
function cleanContent(text: string): string {
  if (!text) return '';

  try {
    const result = remark()
      .use(remarkGfm)
      .use(() => (tree) => {
        visit(tree, (node, index, parent) => {
          if (
            node.type === 'image' ||
            node.type === 'imageReference' ||
            node.type === 'html'
          ) {
            if (parent && typeof index === 'number') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (parent as any).children.splice(index, 1);
              return [SKIP, index];
            }
          }
        });
      })
      .processSync(text);

    return String(result).trim();
  } catch (error) {
    // Fallback if remark fails for any reason
    console.error('[Warning] Markdown cleaning failed:', error);
    return text.trim();
  }
}
