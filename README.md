# GitHub MCP Server (`gh-mcp`)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that enables AI assistants to interact with GitHub. It allows you to manage issues, projects, and metadata directly from your conversation.

## Features

- **Issue Management:** List, search, get, create, update, and delete issues.
- **Project Integration:** Automatically add new issues to a specific GitHub Project board by **name** (no IDs or numbers required).
- **Context Awareness:** Access labels, milestones, and issue types.
- **Smart Defaults:** Configure a default milestone or project in `gh-mcp.toml`.

## Configuration

This tool requires a `gh-mcp.toml` configuration file to know which repository to manage. It searches for this file in the current directory or a `.mcp-config/` subdirectory, walking up the directory tree until found.

### 1. Setup Authentication

You must set the `GITHUB_MCP_PAT` environment variable with a GitHub Personal Access Token (Classic) with `repo` and `project` scopes.

### 2. Create Config File

Create a file named `gh-mcp.toml` (or `.mcp-config/gh-mcp.toml`):

```toml
[repo]
organization = "your-org"
repository = "your-repo"

[project]
# Optional: Automatically add created issues to this project board
name = "Product Roadmap"

# Optional: Automatically assign this milestone to new issues
current_milestone = "Q1 2024 Roadmap"
```

## Tools

- **`github_list_issues`**: List open issues.
- **`github_get_issue`**: Get details of a specific issue.
- **`github_search_issues`**: Search issues using GitHub syntax.
- **`github_create_issue`**: Create a new issue (supports auto-project/milestone assignment).
- **`github_update_issue`**: Update title, body, or state.
- **`github_add_labels`** / **`github_remove_labels`**: Manage issue labels.

## Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build:
   ```bash
   npm run build
   ```
