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
 * Throws ConfigError only on parse/validation errors.
 * Returns null if no file found.
 */
export function loadConfig(forceReload = false): GhMcpConfig | null {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  const configPath = findConfigFile(process.cwd());
  if (!configPath) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const data = parse(content) as Record<string, unknown>;

    const requiredData = data.required as Record<string, string> | undefined;
    const optionalData = data.optional as Record<string, unknown> | undefined;

    if (!requiredData?.repo_url) {
      throw new ConfigError('Missing [required] repo_url in gh-mcp.toml');
    }

    cachedConfig = {
      required: {
        repo_url: requiredData.repo_url,
      },
    };

    if (optionalData) {
      cachedConfig.optional = {
        project_name: optionalData.project_name as string | undefined,
        project_number: undefined,
        current_milestone: optionalData.current_milestone as string | undefined,
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
  return config?.optional?.current_milestone;
}
