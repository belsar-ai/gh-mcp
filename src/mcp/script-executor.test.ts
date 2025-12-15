import { describe, it, expect } from 'vitest';
import { ScriptExecutor } from './script-executor.js';
import { GitHubClient } from '../api/client.js';

describe('ScriptExecutor', () => {
  it('should execute basic math', async () => {
    // Mock client
    const mockClient = {} as unknown as GitHubClient;
    const executor = new ScriptExecutor(mockClient);

    const result = await executor.execute('return 1 + 1;');
    expect(result).toBe(2);
  });

  it('should have access to github context', async () => {
    const mockClient = {
      searchIssues: async (query: string) => [{ title: `Issue matching ${query}` }],
    } as unknown as GitHubClient;

    const executor = new ScriptExecutor(mockClient);

    const script = `
      const issues = await github.searchIssues("foo");
      return issues[0].title;
    `;

    const result = await executor.execute(script);
    expect(result).toBe('Issue matching foo');
  });

  it('should handle top-level await implicitly', async () => {
    const mockClient = {} as unknown as GitHubClient;
    const executor = new ScriptExecutor(mockClient);

    const script = `
      await new Promise(resolve => setTimeout(resolve, 10));
      return "async works";
    `;

    const result = await executor.execute(script);
    expect(result).toBe('async works');
  });

  it('should fail gracefully on errors', async () => {
    const mockClient = {} as unknown as GitHubClient;
    const executor = new ScriptExecutor(mockClient);

    await expect(executor.execute('throw new Error("Boom")')).rejects.toThrow(
      'Boom',
    );
  });
});
