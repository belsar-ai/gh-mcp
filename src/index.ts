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

  private getToolsDefinitions() {
    const { owner, repo } = this.client.getRepoInfo();
    const currentMilestone = this.client.getCurrentMilestone();

    return [
      {
        name: 'execute_github_script',
        description: `Execute JavaScript to interact with GitHub Issues for ${owner}/${repo}.
The script has access to a global 'github' object. Use top-level 'await'. Return the result you want to see.

CONFIGURED REPOSITORY: ${owner}/${repo}
${currentMilestone ? `DEFAULT MILESTONE: ${currentMilestone}` : ''}

AVAILABLE API (on 'github' object):

// ISSUES
github.listIssues(limit?, openOnly?)           // List issues (default: 10, open only)
github.getIssue(number)                        // Get single issue by number
github.searchIssues(query)                     // Search with GitHub syntax (auto-scoped to repo)
github.createIssue({ title, body?, labels?, milestone?, issueType?, parentIssueId? })
github.updateIssue(number, { title?, body?, state? })  // state: 'OPEN' | 'CLOSED'
github.deleteIssue(number)                     // Deletes issue and its subtasks

// LABELS
github.getLabels()                             // Get available labels
github.addLabels(number, ['label1', 'label2']) // Add labels to issue
github.removeLabels(number, ['label1'])        // Remove labels from issue

// CONTEXT
github.getMilestones()                         // Get open milestones
github.getIssueTypes()                         // Get available issue types (Bug, Feature, etc.)
github.getContextIds()                         // Get all IDs (labels, milestones, types, project)
github.getRepoInfo()                           // Get { owner, repo }
github.getCurrentMilestone()                   // Get default milestone from config

EXAMPLES:

1. List open issues:
return await github.listIssues(20);

2. Search for bugs:
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
      tools: this.getToolsDefinitions(),
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

          // Format the result for display
          let textResult = '';
          if (typeof result === 'string') {
            textResult = result;
          } else if (result === undefined) {
            textResult = 'Script executed successfully (no return value).';
          } else if (
            Array.isArray(result) &&
            result.every(
              (item: unknown) =>
                typeof item === 'object' &&
                item !== null &&
                'number' in item &&
                'title' in item,
            )
          ) {
            // Array of GitHub issues
            textResult =
              `Found ${result.length} issues:\n` +
              (result as Array<{ number: number; title: string; url?: string }>)
                .map((item) => `- #${item.number}: ${item.title}${item.url ? ` (${item.url})` : ''}`)
                .join('\n');
          } else if (
            typeof result === 'object' &&
            result !== null &&
            'number' in result &&
            'title' in result
          ) {
            // Single GitHub issue
            const item = result as { number: number; title: string; url?: string };
            textResult = `Issue #${item.number}: ${item.title}${item.url ? `\n${item.url}` : ''}`;
          } else {
            // Fallback: JSON
            textResult = JSON.stringify(result, null, 2);
          }

          return {
            content: [{ type: 'text', text: textResult }],
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          let finalMessage = `Script Execution Error: ${errorMessage}`;

          if (errorMessage.includes('ConfigError')) {
            finalMessage +=
              '\n\nConfiguration issue. Check gh-mcp.toml and GITHUB_TOKEN.';
          }

          return {
            content: [{ type: 'text', text: finalMessage }],
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
