import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { discoverGitHubToken } from './index.js';
import * as fs from 'fs';
import * as os from 'os';

// Mock the fs and os modules
vi.mock('fs');
vi.mock('os');

describe('discoverGitHubToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset console.error spy
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original values
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should use GITHUB_TOKEN environment variable when available', () => {
    process.env.GITHUB_TOKEN = 'env-token';
    const token = discoverGitHubToken();
    expect(token).toBe('env-token');
  });

  it('should use GH_TOKEN environment variable when available', () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'gh-cli-token';
    const token = discoverGitHubToken();
    expect(token).toBe('gh-cli-token');
  });

  it('should use token from ~/.gemini/.env', () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GITHUB_TOKEN=file-token\nOTHER_VAR=foo'
    );

    const token = discoverGitHubToken();
    expect(token).toBe('file-token');
    expect(fs.existsSync).toHaveBeenCalledWith('/home/testuser/.gemini/.env');
  });
  
  it('should handle quoted token in ~/.gemini/.env', () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GITHUB_TOKEN="quoted-token"'
    );

    const token = discoverGitHubToken();
    expect(token).toBe('quoted-token');
  });

  it('should return null if no token found', () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const token = discoverGitHubToken();
    expect(token).toBeNull();
  });
});
