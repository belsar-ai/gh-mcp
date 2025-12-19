# GitHub MCP Server (`gh-mcp`)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that enables AI assistants to interact with GitHub. It allows you to manage issues, projects, and metadata directly from your conversation.

## Features

- **Issue Management:** List, search, get, create, update, and delete issues.
- **Project Integration:** Automatically add new issues to a specific GitHub Project board by **name** (no IDs or numbers required).
- **Context Awareness:** Access labels, milestones, and issue types.
- **Smart Defaults:** Configure a default milestone or project in `gh-mcp.toml`.
- **Script Executor:** A powerful JavaScript execution environment for complex GitHub workflows in a single turn.

## Configuration

This tool requires a `gh-mcp.toml` configuration file to know which repository to manage. It searches for this file in the current directory or a `.mcp-config/` subdirectory, walking up the directory tree until found.

### 1. Setup Authentication

You must set the `GITHUB_MCP_PAT` environment variable with a GitHub Personal Access Token (Classic) with `repo` and `project` (V2) scopes.

### 2. Create Config File

Create a file named `gh-mcp.toml` (or `.mcp-config/gh-mcp.toml`):

```toml
[required]
repo_url = "https://github.com/owner/repo"

[optional]
# The name of your GitHub Project (V2) board.
# If provided, issues created will be added to this project.
project_name = "Product Roadmap"

# Optional: Automatically assign this milestone to new issues
current_milestone = "Q1 2024 Roadmap"
```

### 3. Caching

This tool caches repository metadata (IDs for labels, milestones, etc.) in `.mcp-config/gh-mcp-cache.json` to improve performance. This cache persists indefinitely.

If you add new labels or milestones on GitHub and they don't appear in the AI's context, simply delete the cache file to force a refresh:

```bash
rm .mcp-config/gh-mcp-cache.json
```

## Tools

- **`execute_github_script`**: Execute JavaScript to interact with GitHub Issues. This single, powerful tool allows for complex workflows, batch operations, and agentic behaviors by providing direct access to a GitHub API client.

## Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build:

   ```bash
   npm run build
   ```

3. Test:
   ```bash
   npm test
   ```
