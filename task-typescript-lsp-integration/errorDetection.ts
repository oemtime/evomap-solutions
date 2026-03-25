/**
 * 错误检测引擎
 * 
 * 提供 TypeScript 错误检测和诊断信息解析
 */

import { LSPClient } from './LSPClient';
import { Diagnostic, DiagnosticSeverity, CodeAction } from 'vscode-languageserver-protocol';
import { ErrorInfo } from './TypeScriptAgent';

export class ErrorDetectionEngine {
  private client: LSPClient;
  
  // TypeScript 常见错误代码和修复建议
  private static readonly ERROR_PATTERNS: Record<number, {
    description: string;
    suggestion: string;
    autoFixable: boolean;
  }> = {
    2304: { // Cannot find name 'x'
      description: '找不到名称，可能是未定义或未导入',
      suggestion: '检查变量名拼写，或添加正确的导入语句',
      autoFixable: false
    },
    2322: { // Type 'x' is not assignable to type 'y'
      description: '类型不兼容',
      suggestion: '检查赋值两边的类型是否匹配，可能需要类型断言或转换',
      autoFixable: false
    },
    2345: { // Argument of type 'x' is not assignable to parameter of type 'y'
      description: '函数参数类型不匹配',
      suggestion: '检查传入的参数类型是否符合函数定义',
      autoFixable: false
    },
    7006: { // Parameter 'x' implicitly has an 'any' type
      description: '参数隐式具有 any 类型',
      suggestion: '为参数添加显式类型注解',
      autoFixable: true
    },
    7008: { // Member 'x' implicitly has an 'any' type
      description: '成员隐式具有 any 类型',
      suggestion: '为类成员添加显式类型注解',
      autoFixable: true
    },
    7011: { // Function expression, which lacks return-type annotation
      description: '函数缺少返回类型注解',
      suggestion: '为函数添加返回类型',
      autoFixable: true
    },
    7031: { // Binding element 'x' implicitly has an 'any' type
      description: '解构元素隐式具有 any 类型',
      suggestion: '为解构元素添加类型注解',
      autoFixable: true
    },
    2554: { // Expected N arguments, but got M
      description: '函数参数数量不匹配',
      suggestion: '检查函数调用时传入的参数数量',
      autoFixable: false
    },
    2307: { // Cannot find module 'x'
      description: '找不到模块',
      suggestion: '检查模块名称拼写，或安装缺失的依赖',
      autoFixable: false
    },
    2741: { // Property 'x' is missing in type 'y'
      description: '类型缺少必需属性',
      suggestion: '添加缺失的属性或调整类型定义',
      autoFixable: false
    }
  };

  constructor(client: LSPClient) {
    this.client = client;
  }

  /**
   * 解析诊断信息为错误信息
   */
  parseErrors(diagnostics: Diagnostic[]): ErrorInfo[] {
    return diagnostics.map(diagnostic => this.parseDiagnostic(diagnostic));
  }

  /**
   * 解析单个诊断信息
   */
  private parseDiagnostic(diagnostic: Diagnostic): ErrorInfo {
    const code = diagnostic.code || 'unknown';
    const codeNum = typeof code === 'number' ? code : parseInt(code as string, 10);
    
    const pattern = ErrorDetectionEngine.ERROR_PATTERNS[codeNum];
    
    return {
      message: diagnostic.message,
      code: code.toString(),
      severity: this.severityToString(diagnostic.severity),
      range: diagnostic.range,
      fixes: pattern?.autoFixable ? this.generateFixes(diagnostic, codeNum) : undefined
    };
  }

  /**
   * 严重程度数字转字符串
   */
  private severityToString(severity?: DiagnosticSeverity): ErrorInfo['severity'] {
    switch (severity) {
      case DiagnosticSeverity.Error:
        return 'error';
      case DiagnosticSeverity.Warning:
        return 'warning';
      case DiagnosticSeverity.Information:
        return 'information';
      case DiagnosticSeverity.Hint:
        return 'hint';
      default:
        return 'error';
    }
  }

  /**
   * 生成修复建议
   */
  private generateFixes(diagnostic: Diagnostic, code: number): CodeAction[] {
    const fixes: CodeAction[] = [];
    
    switch (code) {
      case 7006: // Parameter implicitly has 'any' type
        fixes.push({
          title: '添加参数类型注解 (any)',
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [diagnostic.range.start.line.toString()]: [{
                range: diagnostic.range,
                newText: `${this.extractParameterName(diagnostic.message)}: any`
              }]
            }
          }
        });
        break;
        
      case 7008: // Member implicitly has 'any' type
        fixes.push({
          title: '添加类型注解 (any)',
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [diagnostic.range.start.line.toString()]: [{
                range: diagnostic.range,
                newText: `${this.extractMemberName(diagnostic.message)}: any`
              }]
            }
          }
        });
        break;
        
      case 7011: // Missing return type
        fixes.push({
          title: '添加返回类型 (void)',
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [diagnostic.range.start.line.toString()]: [{
                range: diagnostic.range,
                newText: `${this.extractFunctionSignature(diagnostic.message)}: void`
              }]
            }
          }
        });
        break;
    }
    
    return fixes;
  }

  /**
   * 从错误消息中提取参数名
   */
  private extractParameterName(message: string): string {
    const match = message.match(/Parameter ['"`](\w+)['"`]/);
    return match ? match[1] : 'param';
  }

  /**
   * 从错误消息中提取成员名
   */
  private extractMemberName(message: string): string {
    const match = message.match(/Member ['"`](\w+)['"`]/);
    return match ? match[1] : 'member';
  }

  /**
   * 从错误消息中提取函数签名
   */
  private extractFunctionSignature(message: string): string {
    // 简化处理，实际应该更复杂
    return 'function';
  }

  /**
   * 获取错误描述和建议
   */
  getErrorHelp(code: string | number): { description: string; suggestion: string } | null {
    const codeNum = typeof code === 'string' ? parseInt(code, 10) : code;
    const pattern = ErrorDetectionEngine.ERROR_PATTERNS[codeNum];
    
    if (!pattern) {
      return null;
    }
    
    return {
      description: pattern.description,
      suggestion: pattern.suggestion
    };
  }

  /**
   * 分类错误
   */
  categorizeErrors(errors: ErrorInfo[]): {
    syntax: ErrorInfo[];
    type: ErrorInfo[];
    import: ErrorInfo[];
    other: ErrorInfo[];
  } {
    const result = {
      syntax: [] as ErrorInfo[],
      type: [] as ErrorInfo[],
      import: [] as ErrorInfo[],
      other: [] as ErrorInfo[]
    };

    for (const error of errors) {
      const code = parseInt(error.code, 10);
      
      // 语法错误 (1xxx)
      if (code >= 1000 && code < 2000) {
        result.syntax.push(error);
      }
      // 类型错误 (2xxx)
      else if (code >= 2000 && code < 3000) {
        result.type.push(error);
      }
      // 导入错误 (2307 等)
      else if (code === 2307 || code === 2304) {
        result.import.push(error);
      }
      // 隐式 any 错误 (7xxx)
      else if (code >= 7000 && code < 8000) {
        result.type.push(error);
      }
      else {
        result.other.push(error);
      }
    }

    return result;
  }

  /**
   * 检查是否可以自动修复
   */
  canAutoFix(error: ErrorInfo): boolean {
    const code = parseInt(error.code, 10);
    return ErrorDetectionEngine.ERROR_PATTERNS[code]?.autoFixable ?? false;
  }

  /**
   * 获取可自动修复的错误
   */
  getAutoFixableErrors(errors: ErrorInfo[]): ErrorInfo[] {
    return errors.filter(e => this.canAutoFix(e));
  }

  /**
   * 生成错误摘要
   */
  generateSummary(errors: ErrorInfo[]): string {
    if (errors.length === 0) {
      return '✓ 没有发现错误';
    }

    const categorized = this.categorizeErrors(errors);
    const autoFixable = this.getAutoFixableErrors(errors);

    const parts: string[] = [];
    parts.push(`发现 ${errors.length} 个错误:`);
    
    if (categorized.syntax.length > 0) {
      parts.push(`  - 语法错误: ${categorized.syntax.length} 个`);
    }
    if (categorized.type.length > 0) {
      parts.push(`  - 类型错误: ${categorized.type.length} 个`);
    }
    if (categorized.import.length > 0) {
      parts.push(`  - 导入错误: ${categorized.import.length} 个`);
    }
    if (categorized.other.length > 0) {
      parts.push(`  - 其他错误: ${categorized.other.length} 个`);
    }
    
    if (autoFixable.length > 0) {
      parts.push(`\n其中 ${autoFixable.length} 个错误可以自动修复`);
    }

    return parts.join('\n');
  }
}

export default ErrorDetectionEngine;
