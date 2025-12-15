#!/usr/bin/env node

import { GitHubMcpServer } from './index.js';

const server = new GitHubMcpServer();

server.run().catch((error) => {
  console.error('[Fatal] Failed to start GitHub MCP server:', error);
  process.exit(1);
});
