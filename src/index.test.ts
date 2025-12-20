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

  it('should use GITHUB_MCP_PAT environment variable when available', () => {
    process.env.GITHUB_MCP_PAT = 'env-token';
    const token = discoverGitHubToken();
    expect(token).toBe('env-token');
  });

  it('should use token from ~/.gemini/.env', () => {
    delete process.env.GITHUB_MCP_PAT;

    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GITHUB_MCP_PAT=file-token\nOTHER_VAR=foo',
    );

    const token = discoverGitHubToken();
    expect(token).toBe('file-token');
    expect(fs.existsSync).toHaveBeenCalledWith('/home/testuser/.gemini/.env');
  });

  it('should handle quoted token in ~/.gemini/.env', () => {
    delete process.env.GITHUB_MCP_PAT;

    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('GITHUB_MCP_PAT="quoted-token"');

    const token = discoverGitHubToken();
    expect(token).toBe('quoted-token');
  });

  it('should return null if no token found', () => {
    delete process.env.GITHUB_MCP_PAT;
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');

    const token = discoverGitHubToken();
    expect(token).toBeNull();
  });
});

import { formatResult } from './index.js';

describe('formatResult', () => {
  it('should format a single issue', () => {
    const issue = {
      id: '1',
      number: 123,
      title: 'Test Issue',
      url: 'http://example.com',
      state: 'OPEN',
      body: 'Hello world',
      milestone: { title: 'v1.0' },
      labels: { nodes: [{ name: 'bug' }] },
    };
    const formatted = formatResult(issue);
    expect(formatted).toContain('#123: Test Issue');
    expect(formatted).not.toContain('[OPEN]');
    expect(formatted).not.toContain('(Milestone: v1.0)');
    expect(formatted).toContain('Labels: bug');
    expect(formatted).toContain('Hello world');
  });

  it('should format an issue with subtasks', () => {
    const issue = {
      id: '1',
      number: 123,
      title: 'Parent Issue',
      url: 'u1',
      state: 'OPEN',
      subIssues: {
        nodes: [
          { number: 124, title: 'Child One', state: 'OPEN' },
          { number: 125, title: 'Child Two', state: 'CLOSED' },
        ],
      },
    };
    const formatted = formatResult(issue);
    expect(formatted).toContain('Subtasks:');
    expect(formatted).toContain('- #124: Child One');
    expect(formatted).not.toContain('[OPEN]');
    expect(formatted).toContain('- #125: Child Two');
    expect(formatted).not.toContain('[CLOSED]');
  });

  it('should respect showBody: false', () => {
    const issue = {
      id: '1',
      number: 123,
      title: 'Test Issue',
      url: 'u1',
      state: 'OPEN',
      body: 'SECRET DESCRIPTION',
    };
    const result = { data: issue, showBody: false };
    const formatted = formatResult(result);
    expect(formatted).toContain('#123: Test Issue');
    expect(formatted).not.toContain('SECRET DESCRIPTION');
  });

  it('should format an array of issues', () => {
    const issues = [
      { id: '1', number: 1, title: 'One', url: 'u1', state: 'OPEN' },
      { id: '2', number: 2, title: 'Two', url: 'u2', state: 'CLOSED' },
    ];
    const formatted = formatResult(issues);
    expect(formatted).toContain('#1: One');
    expect(formatted).toContain('#2: Two');
  });

  it('should format a milestone', () => {
    const ms = { id: 'm1', number: 5, title: 'M-Five', description: 'Desc' };
    const formatted = formatResult(ms);
    expect(formatted).toBe('Milestone #5: M-Five\nDesc');
  });

  it('should format an object of issues (like a map)', () => {
    const issueMap = {
      '74': {
        id: 'I1',
        number: 74,
        title: 'Issue 74',
        url: 'u74',
        state: 'OPEN',
      },
    };
    const formatted = formatResult(issueMap);
    expect(formatted).toContain('Key: 74');
    expect(formatted).toContain('#74: Issue 74');
  });

  it('should fallback to pretty JSON for other objects', () => {
    const obj = { foo: 'bar', nested: { val: 1 } };
    const formatted = formatResult(obj);
    expect(formatted).toBe(JSON.stringify(obj, null, 2));
  });

  it('should handle undefined', () => {
    expect(formatResult(undefined)).toBe(
      'Script executed successfully (no return value).',
    );
  });
});
