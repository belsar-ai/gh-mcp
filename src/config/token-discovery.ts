import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Discover GitHub token from various sources:
 * 1. GITHUB_MCP_PAT environment variable
 * 2. ~/.gemini/.env file
 */
export function discoverGitHubToken(): string | null {
  // 1. Try GITHUB_MCP_PAT environment variable
  if (process.env.GITHUB_MCP_PAT) {
    console.error('[Info] Using GITHUB_MCP_PAT from environment');
    return process.env.GITHUB_MCP_PAT;
  }

  // 2. Try loading from ~/.gemini/.env
  const envPath = join(homedir(), '.gemini', '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GITHUB_MCP_PAT=')) {
          let token = trimmed.split('=')[1].trim();
          token = token.replace(/^['"]|['"]$/g, ''); // Strip quotes
          console.error('[Info] Using GITHUB_MCP_PAT from ~/.gemini/.env');
          return token;
        }
      }
    } catch {
      // Fall through
    }
  }

  return null;
}
