/**
 * TypeScript Agent LSP 集成 - 入口文件
 */

export { LSPClient, LSPClientOptions, LSPMessage } from './client/LSPClient';
export { 
  TypeScriptAgent, 
  TypeScriptAgentConfig, 
  TypeInfo, 
  ErrorInfo, 
  CompletionContext 
} from './client/TypeScriptAgent';

export { TypeInferenceEngine } from './features/typeInference';
export { ErrorDetectionEngine } from './features/errorDetection';
export { 
  CodeCompletionEngine, 
  EnhancedCompletionItem 
} from './features/codeCompletion';
export { 
  RefactoringEngine, 
  RefactoringOptions, 
  RefactoringSuggestion 
} from './features/refactoring';

export { Logger, LogLevel, LoggerOptions } from './utils/logger';
export * as helpers from './utils/helpers';

// 默认导出
export { TypeScriptAgent as default } from './client/TypeScriptAgent';
