/**
 * 类型推断引擎
 * 
 * 基于 LSP hover 信息提供智能类型推断
 */

import { LSPClient } from './LSPClient';
import { Hover, MarkupContent } from 'vscode-languageserver-protocol';
import { TypeInfo } from './TypeScriptAgent';

export class TypeInferenceEngine {
  private client: LSPClient;

  constructor(client: LSPClient) {
    this.client = client;
  }

  /**
   * 解析 hover 信息为类型信息
   */
  parseTypeInfo(hover: Hover | null): TypeInfo | null {
    if (!hover || !hover.contents) {
      return null;
    }

    const content = this.extractContent(hover.contents);
    if (!content) {
      return null;
    }

    // 解析 TypeScript 类型信息
    const typeMatch = content.match(/```typescript\s*\n?([^`]+)```/);
    if (typeMatch) {
      const signature = typeMatch[1].trim();
      return this.parseSignature(signature, content);
    }

    // 简单类型返回
    return {
      type: content,
      documentation: content
    };
  }

  /**
   * 提取内容字符串
   */
  private extractContent(contents: Hover['contents']): string {
    if (typeof contents === 'string') {
      return contents;
    }
    
    if (Array.isArray(contents)) {
      return contents.map(c => typeof c === 'string' ? c : c.value).join('\n');
    }
    
    return (contents as MarkupContent).value || '';
  }

  /**
   * 解析函数/变量签名
   */
  private parseSignature(signature: string, fullContent: string): TypeInfo {
    // 函数签名: function name(params): returnType
    const funcMatch = signature.match(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*(.+)/);
    if (funcMatch) {
      return {
        name: funcMatch[1],
        type: `(${funcMatch[2]}) => ${funcMatch[3]}`,
        kind: 'function',
        documentation: this.extractDocumentation(fullContent)
      };
    }

    // 箭头函数: const name = (params) => returnType
    const arrowMatch = signature.match(/const\s+(\w+)\s*[=:]\s*\(([^)]*)\)\s*=>\s*(.+)/);
    if (arrowMatch) {
      return {
        name: arrowMatch[1],
        type: `(${arrowMatch[2]}) => ${arrowMatch[3]}`,
        kind: 'function',
        documentation: this.extractDocumentation(fullContent)
      };
    }

    // 变量声明: const name: type
    const varMatch = signature.match(/(?:const|let|var)\s+(\w+)\s*:\s*(.+)/);
    if (varMatch) {
      return {
        name: varMatch[1],
        type: varMatch[2],
        kind: 'variable',
        documentation: this.extractDocumentation(fullContent)
      };
    }

    // 类/接口定义
    const classMatch = signature.match(/(?:class|interface)\s+(\w+)(?:\s+extends\s+(\w+))?/);
    if (classMatch) {
      return {
        name: classMatch[1],
        type: signature,
        kind: classMatch[0].startsWith('class') ? 'class' : 'interface',
        documentation: this.extractDocumentation(fullContent)
      };
    }

    // 默认返回
    return {
      type: signature,
      documentation: this.extractDocumentation(fullContent)
    };
  }

  /**
   * 提取文档说明
   */
  private extractDocumentation(content: string): string | undefined {
    // 移除代码块
    const withoutCode = content.replace(/```[\s\S]*?```/g, '');
    
    // 提取剩余文本作为文档
    const doc = withoutCode.trim();
    return doc.length > 0 ? doc : undefined;
  }

  /**
   * 推断表达式类型
   */
  inferExpressionType(expression: string, context?: Record<string, string>): string {
    // 基于表达式的简单类型推断
    
    // 字符串字面量
    if (/^["'`]/.test(expression)) {
      return 'string';
    }
    
    // 数字字面量
    if (/^-?\d+(\.\d+)?$/.test(expression)) {
      return expression.includes('.') ? 'number' : 'number';
    }
    
    // 布尔字面量
    if (/^(true|false)$/.test(expression)) {
      return 'boolean';
    }
    
    // null 和 undefined
    if (/^(null|undefined)$/.test(expression)) {
      return expression;
    }
    
    // 数组字面量
    if (/^\[.*\]$/.test(expression)) {
      return 'any[]';
    }
    
    // 对象字面量
    if (/^\{.*\}$/.test(expression)) {
      return 'object';
    }
    
    // 箭头函数
    if (/^\s*\([^)]*\)\s*=>/.test(expression)) {
      return 'Function';
    }
    
    // 函数调用
    const callMatch = expression.match(/^(\w+)\s*\(/);
    if (callMatch && context?.[callMatch[1]]) {
      // 从上下文获取返回类型
      const funcType = context[callMatch[1]];
      const returnMatch = funcType.match(/=>\s*(.+)$/);
      if (returnMatch) {
        return returnMatch[1].trim();
      }
    }
    
    // 变量引用
    if (/^\w+$/.test(expression) && context?.[expression]) {
      return context[expression];
    }
    
    // 二元运算
    const binaryMatch = expression.match(/(.+)\s*([+\-*/%])\s*(.+)/);
    if (binaryMatch) {
      const left = this.inferExpressionType(binaryMatch[1].trim(), context);
      const right = this.inferExpressionType(binaryMatch[3].trim(), context);
      
      // 字符串拼接
      if (binaryMatch[2] === '+' && (left === 'string' || right === 'string')) {
        return 'string';
      }
      
      // 数值运算
      if (['+', '-', '*', '/', '%'].includes(binaryMatch[2])) {
        return 'number';
      }
    }
    
    // 三元运算
    const ternaryMatch = expression.match(/(.+)\?\s*(.+)\s*:\s*(.+)/);
    if (ternaryMatch) {
      const trueType = this.inferExpressionType(ternaryMatch[2].trim(), context);
      const falseType = this.inferExpressionType(ternaryMatch[3].trim(), context);
      
      // 如果两边类型相同，返回该类型
      if (trueType === falseType) {
        return trueType;
      }
      
      // 否则返回联合类型
      return `${trueType} | ${falseType}`;
    }
    
    return 'any';
  }

  /**
   * 推断泛型类型参数
   */
  inferGenericTypes(
    genericParams: string[],
    argTypes: string[],
    paramTypes: string[]
  ): Record<string, string> {
    const inferred: Record<string, string> = {};
    
    for (let i = 0; i < paramTypes.length && i < argTypes.length; i++) {
      const paramType = paramTypes[i];
      const argType = argTypes[i];
      
      // 匹配泛型参数
      for (const generic of genericParams) {
        if (paramType === generic) {
          inferred[generic] = argType;
        }
        // 处理数组类型 T[]
        else if (paramType === `${generic}[]` && argType.endsWith('[]')) {
          inferred[generic] = argType.slice(0, -2);
        }
        // 处理 Promise<T> 等
        else {
          const genericRegex = new RegExp(`\\b${generic}\\b`);
          if (genericRegex.test(paramType)) {
            // 尝试从 argType 推断
            const inferredType = this.extractGenericArg(paramType, argType, generic);
            if (inferredType) {
              inferred[generic] = inferredType;
            }
          }
        }
      }
    }
    
    return inferred;
  }

  /**
   * 从具体类型中提取泛型参数
   */
  private extractGenericArg(paramType: string, argType: string, generic: string): string | null {
    // Promise<T> 模式
    const promiseMatch = paramType.match(/^Promise<(.+)\u003e$/);
    if (promiseMatch) {
      const innerMatch = argType.match(/^Promise<(.+)\u003e$/);
      if (innerMatch) {
        return innerMatch[1];
      }
    }
    
    // Array<T> 模式
    const arrayMatch = paramType.match(/^Array<(.+)\u003e$/);
    if (arrayMatch) {
      const innerMatch = argType.match(/^Array<(.+)\u003e$/);
      if (innerMatch) {
        return innerMatch[1];
      }
    }
    
    // Map<K, V> 模式
    const mapMatch = paramType.match(/^Map<([^,]+),\s*(.+)\u003e$/);
    if (mapMatch) {
      const innerMatch = argType.match(/^Map<([^,]+),\s*(.+)\u003e$/);
      if (innerMatch) {
        if (mapMatch[1] === generic) {
          return innerMatch[1];
        }
        if (mapMatch[2] === generic) {
          return innerMatch[2];
        }
      }
    }
    
    return null;
  }
}

export default TypeInferenceEngine;
