import vm from 'node:vm';
import { GitHubClient } from '../api/client.js';

export class ScriptExecutor {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  async execute(code: string): Promise<unknown> {
    // Wrap user code in an async IIFE to allow top-level await
    const wrappedCode = `
      (async () => {
        ${code}
      })()
    `;

    // Create a sandboxed context
    // Expose the GitHub client as 'github'
    const contextObj = {
      github: this.client,
      console: {
        log: (...args: unknown[]) => console.error('[Script Log]', ...args),
        error: (...args: unknown[]) => console.error('[Script Error]', ...args),
        warn: (...args: unknown[]) => console.error('[Script Warn]', ...args),
      },
      // Timers
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      // Block dangerous globals
      fetch: undefined,
      process: undefined,
    };

    const context = vm.createContext(contextObj);

    try {
      const result = await vm.runInContext(wrappedCode, context, {
        timeout: 30000,
        displayErrors: true,
      });

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Script execution failed: ${String(error)}`);
    }
  }
}
