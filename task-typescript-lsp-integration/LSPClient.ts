/**
 * LSP Client - 与 TypeScript Language Server 通信的核心客户端
 * 
 * 功能：
 * 1. 管理 LSP 连接生命周期
 * 2. 发送/接收 JSON-RPC 消息
 * 3. 处理 LSP 协议标准方法
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import {
  InitializeParams,
  InitializeResult,
  TextDocumentItem,
  TextDocumentIdentifier,
  VersionedTextDocumentIdentifier,
  Diagnostic,
  Hover,
  CompletionItem,
  CompletionList,
  CodeAction,
  WorkspaceEdit,
  Position,
  Range,
  TextDocumentContentChangeEvent,
  DocumentUri
} from 'vscode-languageserver-protocol';

export interface LSPClientOptions {
  /** LSP 服务器路径 */
  serverPath: string;
  /** 项目根目录 */
  rootPath: string;
  /** 服务器参数 */
  serverArgs?: string[];
  /** 初始化选项 */
  initializationOptions?: Record<string, unknown>;
  /** 日志回调 */
  onLog?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}

export interface LSPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * LSP 客户端类
 */
export class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private buffer = '';
  private initialized = false;
  private options: LSPClientOptions;

  constructor(options: LSPClientOptions) {
    super();
    this.options = options;
  }

  /**
   * 启动 LSP 服务器并初始化连接
   */
  async start(): Promise<InitializeResult> {
    return new Promise((resolve, reject) => {
      try {
        // 启动 LSP 服务器进程
        const args = this.options.serverArgs || ['--stdio'];
        this.process = spawn(this.options.serverPath, args, {
          cwd: this.options.rootPath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // 处理服务器输出
        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data);
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          this.log(`Server stderr: ${data.toString()}`, 'warn');
        });

        this.process.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

        this.process.on('exit', (code) => {
          this.emit('exit', code);
          if (code !== 0 && code !== null) {
            reject(new Error(`LSP server exited with code ${code}`));
          }
        });

        // 发送初始化请求
        this.initialize().then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 停止 LSP 服务器
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    // 发送关闭通知
    this.sendNotification('exit');
    
    // 终止进程
    this.process.kill();
    this.process = null;
    this.initialized = false;

    // 清理待处理的请求
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('LSP client stopped'));
    }
    this.pendingRequests.clear();
  }

  /**
   * 发送初始化请求
   */
  private async initialize(): Promise<InitializeResult> {
    const params: InitializeParams = {
      processId: process.pid,
      rootUri: `file://${this.options.rootPath}`,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: true,
            willSaveWaitUntil: true,
            didSave: true
          },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true
            }
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ['markdown', 'plaintext']
          },
          definition: {
            dynamicRegistration: false,
            linkSupport: true
          },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true
          },
          codeAction: {
            dynamicRegistration: false,
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: ['', 'quickfix', 'refactor', 'source']
              }
            }
          },
          rename: {
            dynamicRegistration: false,
            prepareSupport: true
          },
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
            tagSupport: {
              valueSet: [1, 2]
            }
          }
        },
        workspace: {
          applyEdit: true,
          workspaceEdit: {
            documentChanges: true
          },
          didChangeConfiguration: {
            dynamicRegistration: false
          },
          didChangeWatchedFiles: {
            dynamicRegistration: false
          },
          symbol: {
            dynamicRegistration: false
          },
          executeCommand: {
            dynamicRegistration: false
          }
        }
      },
      workspaceFolders: [{
        uri: `file://${this.options.rootPath}`,
        name: 'workspace'
      }],
      initializationOptions: this.options.initializationOptions
    };

    const result = await this.sendRequest('initialize', params) as InitializeResult;
    this.initialized = true;
    
    // 发送初始化完成通知
    this.sendNotification('initialized', {});
    
    this.emit('initialized', result);
    return result;
  }

  /**
   * 发送请求并等待响应
   */
  private sendRequest(method: string, params: unknown, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      
      const message: LSPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.sendMessage(message);
    });
  }

  /**
   * 发送通知（无需响应）
   */
  private sendNotification(method: string, params?: unknown): void {
    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.sendMessage(message);
  }

  /**
   * 发送消息到 LSP 服务器
   */
  private sendMessage(message: LSPMessage): void {
    if (!this.process?.stdin) {
      throw new Error('LSP server not running');
    }

    const content = JSON.stringify(message);
    const headers = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    
    this.log(`Sending: ${content}`, 'debug');
    this.process.stdin.write(headers + content);
  }

  /**
   * 处理从服务器接收的数据
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    
    // 解析 LSP 消息（Content-Length 协议）
    while (true) {
      const headerMatch = this.buffer.match(/Content-Length: (\d+)\r\n/);
      if (!headerMatch) break;

      const contentLength = parseInt(headerMatch[1], 10);
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) break;

      const content = this.buffer.substring(messageStart, messageEnd);
      this.buffer = this.buffer.substring(messageEnd);

      try {
        const message: LSPMessage = JSON.parse(content);
        this.handleMessage(message);
      } catch (error) {
        this.log(`Failed to parse message: ${error}`, 'error');
      }
    }
  }

  /**
   * 处理解析后的消息
   */
  private handleMessage(message: LSPMessage): void {
    this.log(`Received: ${JSON.stringify(message)}`, 'debug');

    if (message.id !== undefined) {
      // 响应消息
      const request = this.pendingRequests.get(message.id);
      if (request) {
        clearTimeout(request.timeout);
        this.pendingRequests.delete(message.id);
        
        if (message.error) {
          request.reject(new Error(message.error.message));
        } else {
          request.resolve(message.result);
        }
      }
    } else if (message.method) {
      // 服务器发起的通知/请求
      this.emit('notification', message.method, message.params);
      
      if (message.method === 'textDocument/publishDiagnostics') {
        this.emit('diagnostics', message.params);
      }
    }
  }

  /**
   * 记录日志
   */
  private log(message: string, level: 'debug' | 'info' | 'warn' | 'error'): void {
    if (this.options.onLog) {
      this.options.onLog(message, level);
    }
  }

  // ==================== 公共 API ====================

  /**
   * 打开文档
   */
  async openDocument(uri: DocumentUri, languageId: string, version: number, text: string): Promise<void> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const params = {
      textDocument: {
        uri,
        languageId,
        version,
        text
      } as TextDocumentItem
    };
    
    this.sendNotification('textDocument/didOpen', params);
  }

  /**
   * 更新文档内容
   */
  async changeDocument(uri: DocumentUri, version: number, changes: TextDocumentContentChangeEvent[]): Promise<void> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const params = {
      textDocument: {
        uri,
        version
      } as VersionedTextDocumentIdentifier,
      contentChanges: changes
    };
    
    this.sendNotification('textDocument/didChange', params);
  }

  /**
   * 关闭文档
   */
  async closeDocument(uri: DocumentUri): Promise<void> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const params = {
      textDocument: {
        uri
      } as TextDocumentIdentifier
    };
    
    this.sendNotification('textDocument/didClose', params);
  }

  /**
   * 获取悬停信息（类型提示）
   */
  async getHover(uri: DocumentUri, position: Position): Promise<Hover | null> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position
    });
    
    return result as Hover | null;
  }

  /**
   * 获取代码补全
   */
  async getCompletion(uri: DocumentUri, position: Position, triggerCharacter?: string): Promise<CompletionItem[] | CompletionList | null> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const params: Record<string, unknown> = {
      textDocument: { uri },
      position
    };
    
    if (triggerCharacter) {
      params.context = { triggerKind: 2, triggerCharacter };
    }
    
    const result = await this.sendRequest('textDocument/completion', params);
    return result as CompletionItem[] | CompletionList | null;
  }

  /**
   * 获取代码操作（快速修复）
   */
  async getCodeActions(uri: DocumentUri, range: Range, diagnostics: Diagnostic[]): Promise<CodeAction[] | null> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const result = await this.sendRequest('textDocument/codeAction', {
      textDocument: { uri },
      range,
      context: { diagnostics }
    });
    
    return result as CodeAction[] | null;
  }

  /**
   * 应用工作区编辑
   */
  async applyWorkspaceEdit(edit: WorkspaceEdit): Promise<boolean> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const result = await this.sendRequest('workspace/applyEdit', { edit });
    return (result as { applied: boolean })?.applied ?? false;
  }

  /**
   * 跳转到定义
   */
  async gotoDefinition(uri: DocumentUri, position: Position): Promise<unknown> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    return await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position
    });
  }

  /**
   * 重命名符号
   */
  async rename(uri: DocumentUri, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    if (!this.initialized) throw new Error('LSP client not initialized');
    
    const result = await this.sendRequest('textDocument/rename', {
      textDocument: { uri },
      position,
      newName
    });
    
    return result as WorkspaceEdit | null;
  }

  /**
   * 获取诊断信息
   */
  async getDiagnostics(uri: DocumentUri): Promise<Diagnostic[]> {
    // 触发文档检查
    this.sendNotification('textDocument/didSave', {
      textDocument: { uri }
    });
    
    // 等待诊断结果
    return new Promise((resolve) => {
      const handler = (params: { uri: string; diagnostics: Diagnostic[] }) => {
        if (params.uri === uri) {
          this.off('diagnostics', handler);
          resolve(params.diagnostics);
        }
      };
      
      this.on('diagnostics', handler);
      
      // 超时处理
      setTimeout(() => {
        this.off('diagnostics', handler);
        resolve([]);
      }, 5000);
    });
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export default LSPClient;
