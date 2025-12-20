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
    const milestone = await this.client.getCurrentMilestone();
    const currentMilestone = milestone?.title;

    return [
      {
        name: 'execute_github_script',
        description: `Execute JavaScript to interact with GitHub Issues for ${owner}/${repo}.
The script has access to a global 'github' object. Use top-level 'await'. Return the result you want to see.

CONFIGURED REPOSITORY: ${owner}/${repo}
${currentMilestone ? `DEFAULT MILESTONE: ${currentMilestone}` : ''}

CRITICAL - LIST ISSUES:
When user asks to see issues, ALWAYS use a script that returns the issues directly. Triggers:
- "show me issues in milestone X"
- "list issues"
- "what issues are open"

The output is self-explanatory. Your ONLY response must be "Done." - DO NOT summarize, DO NOT analyze, and DO NOT invent follow-up tasks.

LIST ISSUES - SUMMARY VS FULL:
- "list issues": Return { data: issues, showBody: false }. Shows labels and subtasks, but HIDES descriptions. THIS IS THE PREFERRED DEFAULT.
- "list issues and descriptions": Return issues directly (or { data: issues, showBody: true }). Shows labels, subtasks, AND descriptions.
- Only show descriptions if the user explicitly asks for "descriptions", "details", or "full body".
- Always include subtasks in the output when listing issues.

AVAILABLE API (on 'github' object):

// ISSUES
github.listIssues(limit?, openOnly?)           // List issues (default: 10, open only)
github.getIssue(number)                        // Get single issue by number
github.searchIssues(query)                     // Search with GitHub syntax (auto-scoped to repo)
github.createIssue({ title, body?, labels?, milestone?, issueType?, parentIssueId? })
github.updateIssue(number, { title?, body?, state? })  // state: 'OPEN' | 'CLOSED'
github.deleteIssue(number)                     // Delete single issue by number

// LABELS
github.getLabels()                             // Get available labels
github.addLabels(number, ['label1', 'label2']) // Add labels to issue
github.removeLabels(number, ['label1'])        // Remove labels from issue

// CONTEXT
github.getMilestones()                         // Get open milestones
github.createMilestone({ title, description?, dueOn?, state? })
github.updateMilestone(idOrTitle, { title?, description?, dueOn?, state? })
github.getIssueTypes()                         // Get available issue types (Bug, Feature, etc.)
github.getContextIds()                         // Get all IDs (labels, milestones, types, project)
github.getRepoInfo()                           // Get { owner, repo }
github.getCurrentMilestone()                   // Get default milestone from config

EXAMPLES:

1. List open issues (summary - preferred):
const issues = await github.listIssues(20);
return { data: issues, showBody: false };

2. List issues with full descriptions:
return await github.listIssues(10);

3. Create a milestone and an issue in it:
const milestone = await github.createMilestone({
  title: 'v1.0 Release',
  description: 'Final release of version 1.0'
});
return await github.createIssue({
  title: 'Final QA pass',
  milestone: milestone.title
});

3. Search for bugs:
return await github.searchIssues('is:issue is:open label:Bug');

3. Create issue with type and labels:
return await github.createIssue({
  title: 'Fix login bug',
  body: 'Users cannot log in with SSO',
  labels: ['Bug', 'P1'],
  issueType: 'Bug'
});

4. Create issue with subtasks:
const parent = await github.createIssue({
  title: 'Implement dark mode',
  body: 'Add dark mode support',
  issueType: 'Feature'
});
await github.createIssue({
  title: 'Design dark color palette',
  body: \`Subtask of #\${parent.number}\`,
  parentIssueId: parent.id
});
return parent;

5. Batch close issues:
const issues = await github.searchIssues('is:issue is:open label:stale');
for (const issue of issues) {
  await github.updateIssue(issue.number, { state: 'CLOSED' });
}
return \`Closed \${issues.length} stale issues\`;

6. Get available labels and issue types:
const labels = await github.getLabels();
const types = await github.getIssueTypes();
return { labels, types };

SEARCH TIPS:
- "is:issue is:open" - open issues
- "is:issue is:closed" - closed issues
- "label:Bug" - issues with Bug label
- "milestone:v1.0" - issues in milestone
- "author:username" - issues by author
- "assignee:username" - assigned issues
- "created:>2024-01-01" - created after date
- "updated:<2024-01-01" - not updated since date
`,
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
  let showBody = true;

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

  if (issue.subIssues?.nodes && issue.subIssues.nodes.length > 0) {
    const subtasks = issue.subIssues.nodes
      .map((si) => `  - #${si.number}: ${si.title}`)
      .join('\n');
    output += `\nSubtasks:\n${subtasks}`;
  }

  if (showBody && issue.body) {
    output += `\n\n${issue.body}`;
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
