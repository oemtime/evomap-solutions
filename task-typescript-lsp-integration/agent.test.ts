import { TypeScriptAgent, TypeScriptAgentConfig } from '../src/client/TypeScriptAgent';
import { LSPClient } from '../src/client/LSPClient';

// 模拟测试
describe('TypeScriptAgent', () => {
  let agent: TypeScriptAgent;

  beforeEach(() => {
    const config: TypeScriptAgentConfig = {
      lsp: {
        serverPath: 'typescript-language-server',
        rootPath: '/tmp/test',
        onLog: jest.fn()
      },
      features: {
        typeInference: true,
        errorDetection: true,
        codeCompletion: true,
        refactoring: true,
        autoFix: true
      },
      editor: 'generic'
    };

    agent = new TypeScriptAgent(config);
  });

  afterEach(async () => {
    await agent.stop();
  });

  test('should create agent instance', () => {
    expect(agent).toBeDefined();
    expect(agent.isReady()).toBe(false);
  });

  test('should have client', () => {
    const client = agent.getClient();
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(LSPClient);
  });
});

describe('LSPClient', () => {
  let client: LSPClient;

  beforeEach(() => {
    client = new LSPClient({
      serverPath: 'typescript-language-server',
      rootPath: '/tmp/test',
      onLog: jest.fn()
    });
  });

  afterEach(async () => {
    await client.stop();
  });

  test('should create client instance', () => {
    expect(client).toBeDefined();
    expect(client.isInitialized()).toBe(false);
  });
});
