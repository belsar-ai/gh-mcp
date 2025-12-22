export const getApiDocs = (
  owner: string,
  repo: string,
  currentMilestone?: string,
) => `
The script has access to a global 'github' object. Use top-level 'await'. Return the result you want to see.

CONFIGURED REPOSITORY: ${owner}/${repo}
${currentMilestone ? `DEFAULT MILESTONE: ${currentMilestone}` : ''}

CRITICAL - MENTAL MODEL:
When user asks to see issues, ALWAYS use a script that returns the issues directly. Triggers: "list issues", "show open bugs", etc.
- Your ONLY response after the tool output must be "Done."
- DO NOT summarize. DO NOT analyze. DO NOT invent follow-up tasks.
- If the output is empty, just say "No items found."

LIST ISSUES - SUMMARY VS FULL:
- By default, return { data: issues, showBody: false }. This shows labels and subtasks but hides the description.
- Only show descriptions if the user explicitly asks for "descriptions", "details", or "full body".
- Always include subtasks in the output when listing issues.

AVAILABLE API:

// ISSUES
github.listIssues(limit?, openOnly?, milestone?)           // List issues (can filter by milestone title)
github.getIssue(number)                        // Get single issue details
github.searchIssues(query)                     // Powerful search (preferred for filtering)
github.createIssue({ title, body?, labels?, milestone?, issueType?, parentIssueId? })  // parentIssueId: issue number or node ID
github.updateIssue(number, { title?, body?, state? })  // state: 'OPEN' | 'CLOSED'
github.deleteIssue(number)

// PULL REQUESTS
github.getPullRequest(number)                  // Get PR with description, comments, checks & replies
github.getWorkflowLogs(runId)                  // Get logs from failed jobs in a workflow run

// LABELS & MILESTONES
github.getLabels()                             // Get all label names
github.getMilestones()                         // Get all open milestone titles
github.createMilestone({ title, description?, dueOn?, state? })
github.updateMilestone(idOrTitle, { title?, description?, dueOn?, state? })

// CONTEXT
github.getRepoInfo()                           // Get { owner, repo }
github.getCurrentMilestone()                   // Get default milestone from config
github.getContextIds()                         // Get internal IDs for labels/milestones
github.help()                                  // Show this documentation

EXAMPLES:

1. List open issues for current milestone (preferred way):
const milestone = await github.getCurrentMilestone();
return await github.listIssues(20, true, milestone.title);

2. Add subtask to existing issue #94:
return github.createIssue({ title: 'Subtask', parentIssueId: 94 });

3. Create parent with subtask in one script:
const parent = await github.createIssue({ title: 'Main Task' });
await github.createIssue({ title: 'Subtask', parentIssueId: parent.number });
return parent;

4. Batch operations:
const issues = await github.searchIssues('label:stale is:open');
for (const issue of issues) {
  await github.updateIssue(issue.number, { state: 'CLOSED' });
}
return "Closed " + issues.length + " issues";

SEARCH TIPS (Use searchIssues for these):
- 'milestone:"v1.0 Release"'
- "label:Bug label:P1"
- "is:closed updated:>2024-01-01"
- "author:username"
- "no:milestone"

`;
