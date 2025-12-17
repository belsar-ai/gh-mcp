#!/usr/bin/env node

import { GitHubMcpServer } from './index.js';

async function main() {
  try {
    const server = new GitHubMcpServer();
    await server.run();
  } catch (error) {
    console.error('[Fatal] Failed to start GitHub MCP server:', error);
    process.exit(1);
  }
}

main();
