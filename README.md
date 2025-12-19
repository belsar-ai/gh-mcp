# gh-mcp

Model Context Protocol (MCP) server for **GitHub Issues** and **Projects**.

Designed by belsar.ai to enable AI assistants to manage your GitHub workflow with ease and efficiency.

## Architecture: Script Mode

This MCP server uses a **Script Execution** architecture. Instead of exposing dozens of restricted tools, it exposes a single, powerful tool: `execute_github_script`.

This allows the AI to write and execute secure JavaScript code to interact with your GitHub repository directly. This enables:

- **Complex Workflows:** "Find all open bugs without a milestone, assign them to 'Sprint 1', and add the 'high-priority' label" (1 turn vs. 20 turns).
- **Batch Operations:** Update dozens of issues in a single shot.
- **Data Processing:** Filter, sort, and aggregate issue data using standard JavaScript.
- **Efficiency:** Drastically reduces context usage and latency.

## Quick Start

1.  **Generate a Token:** Create a [GitHub Personal Access Token (Classic)](https://github.com/settings/tokens) with `repo` and `project` (V2) scopes.
2.  **Set Environment Variable:** Set `GITHUB_MCP_PAT` in your environment (e.g., in your `.bashrc`, `.zshrc`, or `~/.gemini/.env`).
3.  **Pick the install command for your platform:**

```bash
claude mcp add --transport stdio github -- npx -y @belsar-ai/gh-mcp
```

```bash
codex mcp add github -- npx -y @belsar-ai/gh-mcp
```

```bash
gemini extensions install https://github.com/belsar-ai/gh-mcp
```

4.  **Configure your Repo:** Create a `.mcp-config/gh-mcp.toml` in your project root (see Configuration below).

## Configuration

This tool requires a `gh-mcp.toml` file to know which repository to manage. It searches for this file in the current directory or a `.mcp-config/` subdirectory, walking up the tree until found.

### `gh-mcp.toml`

```toml
[required]
repo_url = "https://github.com/owner/repo"

[optional]
# If provided, new issues are automatically added to this Project (V2) board by name
project_name = "Product Roadmap"

# Automatically assign this milestone to new issues if not specified
current_milestone = "v1.0 Release"
```

## Uninstall

To uninstall:

```bash
claude mcp remove github
```

```bash
codex mcp remove github
```

```bash
gemini extensions uninstall gh-mcp
```

## Example Usage

The AI can now handle complex repository management in a single shot:

```
List all open bugs and summarize the top 3 most recent ones.
```

```
Find all issues tagged 'stale' and close them with a comment "Closing due to inactivity".
```

```
Create a new feature request for "Dark Mode" and add it to my 'Product Roadmap' project.
```

## Available API (Script Context)

The AI has access to a global `github` object with the following methods:

### Issues (`github`)

- `listIssues(limit?, openOnly?)`: List issues (default limit: 10, open only).
- `getIssue(number)`: Get full details for a specific issue.
- `searchIssues(query)`: Search using GitHub syntax (auto-scoped to your repo).
- `createIssue({ title, body?, labels?, milestone?, issueType?, parentIssueId? })`: Create a new issue.
- `updateIssue(number, { title?, body?, state? })`: Update an issue.
- `deleteIssue(number)`: Delete an issue.

### Labels & Metadata

- `getLabels()`: List all available labels in the repo.
- `addLabels(number, labels[])`: Add labels to an issue.
- `removeLabels(number, labels[])`: Remove labels from an issue.
- `getMilestones()`: List open milestones.
- `getIssueTypes()`: List available issue types (for organizations with custom types).

### Context & Config

- `getRepoInfo()`: Get owner and repo name.
- `getCurrentMilestone()`: Get the default milestone from your config.
- `getContextIds()`: Get internal IDs for labels, milestones, etc. (cached).

## Troubleshooting

- **Token Issues:** Ensure `GITHUB_MCP_PAT` is correctly set and has `repo` scope.
- **Cache:** Metadata (IDs) is cached in `.mcp-config/gh-mcp-cache.json`. Delete this file to force a refresh if you add new labels or milestones.
- **Config Not Found:** Ensure `.mcp-config/gh-mcp.toml` exists in your project or a parent directory.
