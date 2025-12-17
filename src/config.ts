import { parse } from 'smol-toml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GhMcpConfig } from './types/github.js';
import { ConfigError } from './types/github.js';

const CONFIG_FILENAME = 'gh-mcp.toml';

/**
 * Walk up directories to find gh-mcp.toml (like .git discovery)
 */
function findConfigFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, '.mcp-config', CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check root as well
  const rootConfig = path.join(root, '.mcp-config', CONFIG_FILENAME);
  if (fs.existsSync(rootConfig)) {
    return rootConfig;
  }

  return null;
}

let cachedConfig: GhMcpConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Load config from gh-mcp.toml, walking up from cwd.
 * Throws ConfigError if no file found.
 */
export function loadConfig(forceReload = false): GhMcpConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  const configPath = findConfigFile(process.cwd());
  if (!configPath) {
    throw new ConfigError(
      `Configuration file '.mcp-config/${CONFIG_FILENAME}' not found.\n` +
        `Please create a '.mcp-config/${CONFIG_FILENAME}' file with the following structure:\n\n` +
        '```toml\n' +
        '[repo]\n' +
        'organization = "<YOUR_GITHUB_ORG_OR_USERNAME>"\n' +
        'repository = "<YOUR_REPO_NAME>"\n\n' +
        '# Optional\n' +
        '[project]\n' +
        'number = <PROJECT_NUMBER>\n' +
        'current_milestone = "<MILESTONE_TITLE>"\n' +
        '```',
    );
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const data = parse(content) as Record<string, unknown>;

    const repoData = data.repo as Record<string, string> | undefined;
    const projectData = data.project as Record<string, unknown> | undefined;

    if (!repoData?.organization || !repoData?.repository) {
      throw new ConfigError(
        'Missing [repo] organization or repository in gh-mcp.toml',
      );
    }

    cachedConfig = {
      repo: {
        organization: repoData.organization,
        repository: repoData.repository,
      },
    };

    if (projectData) {
      cachedConfig.project = {
        name: projectData.name as string | undefined,
        number: undefined,
        current_milestone: projectData.current_milestone as string | undefined,
      };
    }

    cachedConfigPath = configPath;
    console.error(`[Info] Loaded config from ${configPath}`);
    return cachedConfig;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(`Failed to parse ${configPath}: ${error}`);
  }
}

/**
 * Get the path to the loaded config file, if any.
 */
export function getConfigPath(): string | null {
  return cachedConfigPath;
}

/**
 * Get the current milestone from config, if set.
 */
export function getCurrentMilestone(): string | undefined {
  const config = loadConfig();
  return config.project?.current_milestone;
}
