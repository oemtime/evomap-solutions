/**
 * TypeScript Agent - 主类
 * 
 * 提供 TypeScript 智能类型推断、错误检测、代码补全等功能
 */

import { EventEmitter } from 'events';
import { LSPClient, LSPClientOptions } from './LSPClient';
import { TypeInferenceEngine } from '../features/typeInference';
import { ErrorDetectionEngine } from '../features/errorDetection';
import { CodeCompletionEngine } from '../features/codeCompletion';
import { RefactoringEngine } from '../features/refactoring';
import { Position, Range, Diagnostic, CompletionItem, CodeAction, Hover, WorkspaceEdit } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';

export interface TypeScriptAgentConfig {
  /** LSP 客户端配置 */
  lsp: LSPClientOptions;
  /** 功能开关 */
  features?: {
    typeInference?: boolean;
    errorDetection?: boolean;
    codeCompletion?: boolean;
    refactoring?: boolean;
    autoFix?: boolean;
  };
  /** 编辑器类型 */
  editor?: 'vscode' | 'vim' | 'neovim' | 'generic';
}

export interface TypeInfo {
  /** 类型字符串 */
  type: string;
  /** 文档说明 */
  documentation?: string;
  /** 符号名称 */
  name?: string;
  /** 符号类型 */
  kind?: string;
}

export interface ErrorInfo {
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code: string | number;
  /** 严重程度 */
  severity: 'error' | 'warning' | 'information' | 'hint';
  /** 位置范围 */
  range: Range;
  /** 修复建议 */
  fixes?: CodeAction[];
}

export interface CompletionContext {
  /** 触发字符 */
  triggerCharacter?: string;
  /** 触发类型 */
  triggerKind?: 'invoked' | 'character' | 'forIncompleteCompletions';
}

/**
 * TypeScript Agent 主类
 */
export class TypeScriptAgent extends EventEmitter {
  private client: LSPClient;
  private config: Required<TypeScriptAgentConfig>;
  private typeInference: TypeInferenceEngine;
  private errorDetection: ErrorDetectionEngine;
  private codeCompletion: CodeCompletionEngine;
  private refactoring: RefactoringEngine;
  private openDocuments = new Map<string, { version: number; content: string }>();

  constructor(config: TypeScriptAgentConfig) {
    super();
    
    this.config = {
      lsp: config.lsp,
      features: {
        typeInference: true,
        errorDetection: true,
        codeCompletion: true,
        refactoring: true,
        autoFix: true,
        ...config.features
      },
      editor: config.editor || 'generic'
    };

    // 初始化 LSP 客户端
    this.client = new LSPClient(this.config.lsp);
    
    // 初始化功能引擎
    this.typeInference = new TypeInferenceEngine(this.client);
    this.errorDetection = new ErrorDetectionEngine(this.client);
    this.codeCompletion = new CodeCompletionEngine(this.client);
    this.refactoring = new RefactoringEngine(this.client);

    // 监听诊断信息
    this.client.on('diagnostics', (params) => {
      this.emit('diagnostics', params);
    });
  }

  /**
   * 启动 Agent
   */
  async start(): Promise<void> {
    try {
      const result = await this.client.start();
      this.emit('ready', result);
      this.log('TypeScript Agent started successfully', 'info');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 停止 Agent
   */
  async stop(): Promise<void> {
    await this.client.stop();
    this.openDocuments.clear();
    this.log('TypeScript Agent stopped', 'info');
  }

  /**
   * 打开文档
   */
  async openDocument(filePath: string, content: string, languageId = 'typescript'): Promise<void> {
    const uri = this.filePathToUri(filePath);
    const version = 1;
    
    this.openDocuments.set(uri, { version, content });
    await this.client.openDocument(uri, languageId, version, content);
    this.log(`Document opened: ${filePath}`, 'debug');
  }

  /**
   * 更新文档内容
   */
  async updateDocument(filePath: string, content: string): Promise<void> {
    const uri = this.filePathToUri(filePath);
    const doc = this.openDocuments.get(uri);
    
    if (!doc) {
      throw new Error(`Document not open: ${filePath}`);
    }

    const newVersion = doc.version + 1;
    const oldContent = doc.content;
    
    // 计算增量变更（简化实现，实际应使用 diff 算法）
    const changes = [{
      text: content,
      range: {
        start: { line: 0, character: 0 },
        end: this.getEndPosition(oldContent)
      }
    }];

    this.openDocuments.set(uri, { version: newVersion, content });
    await this.client.changeDocument(uri, newVersion, changes);
  }

  /**
   * 关闭文档
   */
  async closeDocument(filePath: string): Promise<void> {
    const uri = this.filePathToUri(filePath);
    this.openDocuments.delete(uri);
    await this.client.closeDocument(uri);
    this.log(`Document closed: ${filePath}`, 'debug');
  }

  /**
   * 获取类型信息
   */
  async getTypeAtPosition(filePath: string, line: number, character: number): Promise<TypeInfo | null> {
    if (!this.config.features.typeInference) {
      return null;
    }

    const uri = this.filePathToUri(filePath);
    const position: Position = { line, character };
    
    try {
      const hover = await this.client.getHover(uri, position);
      return this.typeInference.parseTypeInfo(hover);
    } catch (error) {
      this.log(`Failed to get type info: ${error}`, 'error');
      return null;
    }
  }

  /**
   * 获取文档中的所有错误
   */
  async getErrors(filePath: string): Promise<ErrorInfo[]> {
    if (!this.config.features.errorDetection) {
      return [];
    }

    const uri = this.filePathToUri(filePath);
    
    try {
      const diagnostics = await this.client.getDiagnostics(uri);
      return this.errorDetection.parseErrors(diagnostics);
    } catch (error) {
      this.log(`Failed to get errors: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 获取代码补全建议
   */
  async getCompletions(
    filePath: string, 
    line: number, 
    character: number,
    context?: CompletionContext
  ): Promise<CompletionItem[]> {
    if (!this.config.features.codeCompletion) {
      return [];
    }

    const uri = this.filePathToUri(filePath);
    const position: Position = { line, character };
    
    try {
      const result = await this.client.getCompletion(
        uri, 
        position, 
        context?.triggerCharacter
      );
      return this.codeCompletion.parseCompletions(result);
    } catch (error) {
      this.log(`Failed to get completions: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 获取错误修复建议
   */
  async getFixes(filePath: string, line: number, character: number): Promise<CodeAction[]> {
    if (!this.config.features.autoFix) {
      return [];
    }

    const uri = this.filePathToUri(filePath);
    const position: Position = { line, character };
    
    // 获取该位置的错误
    const errors = await this.getErrors(filePath);
    const positionErrors = errors.filter(e => 
      this.isPositionInRange(position, e.range)
    );

    if (positionErrors.length === 0) {
      return [];
    }

    // 转换为 LSP Diagnostic 格式
    const diagnostics = positionErrors.map(e => ({
      range: e.range,
      message: e.message,
      severity: this.severityToNumber(e.severity),
      code: e.code
    }));

    try {
      const range: Range = {
        start: { line, character: Math.max(0, character - 1) },
        end: { line, character: character + 1 }
      };
      
      const actions = await this.client.getCodeActions(uri, range, diagnostics);
      return actions || [];
    } catch (error) {
      this.log(`Failed to get fixes: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 应用代码修复
   */
  async applyFix(filePath: string, action: CodeAction): Promise<boolean> {
    if (!action.edit) {
      return false;
    }

    try {
      return await this.client.applyWorkspaceEdit(action.edit);
    } catch (error) {
      this.log(`Failed to apply fix: ${error}`, 'error');
      return false;
    }
  }

  /**
   * 重命名符号
   */
  async renameSymbol(filePath: string, line: number, character: number, newName: string): Promise<WorkspaceEdit | null> {
    if (!this.config.features.refactoring) {
      return null;
    }

    const uri = this.filePathToUri(filePath);
    const position: Position = { line, character };
    
    try {
      return await this.client.rename(uri, position, newName);
    } catch (error) {
      this.log(`Failed to rename: ${error}`, 'error');
      return null;
    }
  }

  /**
   * 跳转到定义
   */
  async gotoDefinition(filePath: string, line: number, character: number): Promise<{ uri: string; range: Range }[] | null> {
    const uri = this.filePathToUri(filePath);
    const position: Position = { line, character };
    
    try {
      const result = await this.client.gotoDefinition(uri, position);
      
      if (!result) return null;
      
      // 处理不同的返回格式
      if (Array.isArray(result)) {
        return result.map((loc: { uri: string; range: Range }) => ({
          uri: loc.uri,
          range: loc.range
        }));
      } else {
        return [{ uri: (result as { uri: string }).uri, range: (result as { range: Range }).range }];
      }
    } catch (error) {
      this.log(`Failed to goto definition: ${error}`, 'error');
      return null;
    }
  }

  /**
   * 智能修复所有可自动修复的错误
   */
  async fixAll(filePath: string): Promise<{ applied: number; failed: number }> {
    const errors = await this.getErrors(filePath);
    let applied = 0;
    let failed = 0;

    for (const error of errors) {
      if (error.fixes && error.fixes.length > 0) {
        const success = await this.applyFix(filePath, error.fixes[0]);
        if (success) {
          applied++;
        } else {
          failed++;
        }
      }
    }

    return { applied, failed };
  }

  // ==================== 辅助方法 ====================

  /**
   * 文件路径转 URI
   */
  private filePathToUri(filePath: string): string {
    return URI.file(filePath).toString();
  }

  /**
   * URI 转文件路径
   */
  private uriToFilePath(uri: string): string {
    return URI.parse(uri).fsPath;
  }

  /**
   * 获取内容结束位置
   */
  private getEndPosition(content: string): Position {
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1];
    return {
      line: lines.length - 1,
      character: lastLine.length
    };
  }

  /**
   * 检查位置是否在范围内
   */
  private isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    return true;
  }

  /**
   * 严重程度转数字
   */
  private severityToNumber(severity: string): number {
    switch (severity) {
      case 'error': return 1;
      case 'warning': return 2;
      case 'information': return 3;
      case 'hint': return 4;
      default: return 1;
    }
  }

  /**
   * 记录日志
   */
  private log(message: string, level: 'debug' | 'info' | 'warn' | 'error'): void {
    if (this.config.lsp.onLog) {
      this.config.lsp.onLog(`[Agent] ${message}`, level);
    }
    this.emit('log', message, level);
  }

  /**
   * 获取 LSP 客户端实例
   */
  getClient(): LSPClient {
    return this.client;
  }

  /**
   * 检查是否已就绪
   */
  isReady(): boolean {
    return this.client.isInitialized();
  }
}

export default TypeScriptAgent;
