import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { loadConfig } from './config.js';
import { GitHubClient } from './api/client.js';

vi.mock('node:fs');

describe('Config and URL Parsing', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadConfig', () => {
    it('should load a valid config with [required] repo_url', () => {
      const mockToml = `
[required]
repo_url = "https://github.com/test-org/test-repo"
`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockToml);

      const config = loadConfig(true);
      expect(config?.required.repo_url).toBe(
        'https://github.com/test-org/test-repo',
      );
    });
  });

  describe('GitHubClient.getRepoInfo', () => {
    const setupConfig = (url: string) => {
      const mockToml = `[required]\nrepo_url = "${url}"`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockToml);
      loadConfig(true);
    };

    it('should correctly parse standard github URL', () => {
      setupConfig('https://github.com/owner/repo');
      const client = new GitHubClient();
      const info = client.getRepoInfo();
      expect(info).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should strip trailing .git', () => {
      setupConfig('https://github.com/owner/repo.git');
      const client = new GitHubClient();
      const info = client.getRepoInfo();
      expect(info).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should throw on non-github host', () => {
      setupConfig('https://gitlab.com/owner/repo');
      const client = new GitHubClient();
      expect(() => client.getRepoInfo()).toThrow(/Only github.com URLs/);
    });

    it('should throw on invalid characters', () => {
      setupConfig('https://github.com/owner/repo with space');
      const client = new GitHubClient();
      expect(() => client.getRepoInfo()).toThrow(/invalid characters/);
    });

    it('should throw on missing repo part', () => {
      setupConfig('https://github.com/owner');
      const client = new GitHubClient();
      expect(() => client.getRepoInfo()).toThrow(
        /at least an owner and a repository/,
      );
    });
  });
});
