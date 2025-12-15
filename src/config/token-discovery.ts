import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Discover GitHub token from various sources:
 * 1. GITHUB_TOKEN environment variable
 * 2. GH_TOKEN environment variable (GitHub CLI style)
 * 3. ~/.gemini/.env file
 */
export function discoverGitHubToken(): string | null {
  // 1. Try GITHUB_TOKEN environment variable
  if (process.env.GITHUB_TOKEN) {
    console.error('[Info] Using GITHUB_TOKEN from environment');
    return process.env.GITHUB_TOKEN;
  }

  // 2. Try GH_TOKEN environment variable (GitHub CLI convention)
  if (process.env.GH_TOKEN) {
    console.error('[Info] Using GH_TOKEN from environment');
    return process.env.GH_TOKEN;
  }

  // 3. Try loading from ~/.gemini/.env
  const envPath = join(homedir(), '.gemini', '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GITHUB_TOKEN=')) {
          let token = trimmed.split('=')[1].trim();
          token = token.replace(/^['"]|['"]$/g, ''); // Strip quotes
          console.error('[Info] Using GITHUB_TOKEN from ~/.gemini/.env');
          return token;
        }
      }
    } catch {
      // Fall through
    }
  }

  return null;
}
