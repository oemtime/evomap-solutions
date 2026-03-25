/**
 * 重构引擎
 * 
 * 提供代码重构建议和功能
 */

import { LSPClient } from './LSPClient';
import { 
  WorkspaceEdit, 
  CodeAction, 
  CodeActionKind,
  Position,
  Range
} from 'vscode-languageserver-protocol';

export interface RefactoringOptions {
  /** 文件路径 */
  filePath: string;
  /** 选中的范围 */
  range: Range;
  /** 新名称（用于重命名） */
  newName?: string;
}

export interface ExtractFunctionOptions extends RefactoringOptions {
  /** 函数名 */
  functionName: string;
  /** 是否异步 */
  isAsync?: boolean;
  /** 参数列表 */
  parameters?: string[];
}

export interface RefactoringSuggestion {
  /** 建议标题 */
  title: string;
  /** 建议描述 */
  description: string;
  /** 代码操作 */
  action: CodeAction;
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high';
}

export class RefactoringEngine {
  private client: LSPClient;

  constructor(client: LSPClient) {
    this.client = client;
  }

  /**
   * 重命名符号
   */
  async renameSymbol(
    filePath: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    return await this.client.rename(
      `file://${filePath}`,
      position,
      newName
    );
  }

  /**
   * 生成重命名建议
   */
  generateRenameSuggestions(
    currentName: string,
    symbolType: 'variable' | 'function' | 'class' | 'interface' | 'property'
  ): string[] {
    const suggestions: string[] = [];
    
    switch (symbolType) {
      case 'variable':
        // 常见命名约定
        if (currentName.startsWith('is') || currentName.startsWith('has')) {
          suggestions.push(`${currentName}Value`);
        } else {
          suggestions.push(`new${this.capitalize(currentName)}`);
          suggestions.push(`${currentName}Value`);
        }
        break;
        
      case 'function':
        if (currentName.startsWith('get')) {
          suggestions.push(`fetch${currentName.slice(3)}`);
          suggestions.push(`load${currentName.slice(3)}`);
        } else if (currentName.startsWith('set')) {
          suggestions.push(`update${currentName.slice(3)}`);
          suggestions.push(`save${currentName.slice(3)}`);
        } else {
          suggestions.push(`do${this.capitalize(currentName)}`);
          suggestions.push(`process${this.capitalize(currentName)}`);
        }
        break;
        
      case 'class':
        suggestions.push(`${currentName}Impl`);
        suggestions.push(`Base${currentName}`);
        suggestions.push(`${currentName}Base`);
        break;
        
      case 'interface':
        suggestions.push(`${currentName}Props`);
        suggestions.push(`${currentName}Config`);
        suggestions.push(`I${currentName}`);
        break;
        
      case 'property':
        suggestions.push(`_${currentName}`);
        suggestions.push(`_${currentName}Value`);
        suggestions.push(`${currentName}Prop`);
        break;
    }
    
    return suggestions.filter(s => s !== currentName);
  }

  /**
   * 提取函数
   */
  generateExtractFunctionSuggestion(
    options: ExtractFunctionOptions
  ): RefactoringSuggestion {
    const { filePath, range, functionName, isAsync = false, parameters = [] } = options;
    
    const asyncKeyword = isAsync ? 'async ' : '';
    const paramString = parameters.join(', ');
    
    // 生成提取的函数
    const extractedFunction = [
      `${asyncKeyword}function ${functionName}(${paramString}) {`,
      `  // TODO: 提取的代码`,
      `}`
    ].join('\n');

    const action: CodeAction = {
      title: `提取函数: ${functionName}`,
      kind: CodeActionKind.RefactorExtract,
      edit: {
        changes: {
          [filePath]: [
            {
              range: {
                start: { line: range.start.line, character: 0 },
                end: { line: range.start.line, character: 0 }
              },
              newText: extractedFunction + '\n\n'
            },
            {
              range: range,
              newText: `${isAsync ? 'await ' : ''}${functionName}(${paramString});`
            }
          ]
        }
      }
    };

    return {
      title: `提取函数: ${functionName}`,
      description: `将选中的代码提取为 ${functionName} 函数`,
      action,
      riskLevel: 'low'
    };
  }

  /**
   * 提取变量
   */
  generateExtractVariableSuggestion(
    filePath: string,
    range: Range,
    expression: string,
    variableName: string,
    isConst = true
  ): RefactoringSuggestion {
    const declaration = isConst ? 'const' : 'let';
    
    const action: CodeAction = {
      title: `提取变量: ${variableName}`,
      kind: CodeActionKind.RefactorExtract,
      edit: {
        changes: {
          [filePath]: [
            {
              range: {
                start: { line: range.start.line, character: 0 },
                end: { line: range.start.line, character: 0 }
              },
              newText: `${declaration} ${variableName} = ${expression};\n`
            },
            {
              range: range,
              newText: variableName
            }
          ]
        }
      }
    };

    return {
      title: `提取变量: ${variableName}`,
      description: `将表达式提取为 ${variableName} 变量`,
      action,
      riskLevel: 'low'
    };
  }

  /**
   * 内联变量
   */
  generateInlineVariableSuggestion(
    filePath: string,
    variableRange: Range,
    variableName: string,
    value: string,
    usageRanges: Range[]
  ): RefactoringSuggestion {
    const changes = usageRanges.map(usageRange => ({
      range: usageRange,
      newText: value
    }));

    // 删除变量声明
    changes.push({
      range: variableRange,
      newText: ''
    });

    const action: CodeAction = {
      title: `内联变量: ${variableName}`,
      kind: CodeActionKind.RefactorInline,
      edit: {
        changes: {
          [filePath]: changes
        }
      }
    };

    return {
      title: `内联变量: ${variableName}`,
      description: `将 ${variableName} 的所有使用替换为其值`,
      action,
      riskLevel: 'medium'
    };
  }

  /**
   * 移动函数/类到新文件
   */
  generateMoveToNewFileSuggestion(
    sourceFile: string,
    targetFile: string,
    code: string,
    symbolName: string
  ): RefactoringSuggestion {
    const action: CodeAction = {
      title: `移动到新文件: ${targetFile}`,
      kind: CodeActionKind.RefactorMove,
      edit: {
        documentChanges: [
          {
            kind: 'create',
            uri: `file://${targetFile}`,
            options: { overwrite: false }
          },
          {
            kind: 'change',
            uri: `file://${targetFile}`,
            edits: [{
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
              },
              newText: code
            }]
          }
        ]
      }
    };

    return {
      title: `移动到新文件: ${symbolName}`,
      description: `将 ${symbolName} 移动到 ${targetFile}`,
      action,
      riskLevel: 'medium'
    };
  }

  /**
   * 转换为箭头函数
   */
  generateConvertToArrowFunctionSuggestion(
    filePath: string,
    functionRange: Range,
    functionName: string,
    parameters: string[],
    body: string,
    returnType?: string
  ): RefactoringSuggestion {
    const paramString = parameters.join(', ');
    const returnTypeAnnotation = returnType ? `: ${returnType}` : '';
    
    const arrowFunction = `const ${functionName} = (${paramString})${returnTypeAnnotation} => ${body};`;
    
    const action: CodeAction = {
      title: '转换为箭头函数',
      kind: CodeActionKind.RefactorRewrite,
      edit: {
        changes: {
          [filePath]: [{
            range: functionRange,
            newText: arrowFunction
          }]
        }
      }
    };

    return {
      title: '转换为箭头函数',
      description: `将 ${functionName} 转换为箭头函数`,
      action,
      riskLevel: 'low'
    };
  }

  /**
   * 添加类型注解
   */
  generateAddTypeAnnotationSuggestion(
    filePath: string,
    position: Position,
    symbolName: string,
    typeString: string
  ): RefactoringSuggestion {
    const action: CodeAction = {
      title: `添加类型注解: ${typeString}`,
      kind: CodeActionKind.QuickFix,
      edit: {
        changes: {
          [filePath]: [{
            range: {
              start: position,
              end: position
            },
            newText: `: ${typeString}`
          }]
        }
      }
    };

    return {
      title: `添加类型注解: ${symbolName}`,
      description: `为 ${symbolName} 添加 ${typeString} 类型注解`,
      action,
      riskLevel: 'low'
    };
  }

  /**
   * 生成接口建议
   */
  generateInterfaceFromObjectSuggestion(
    filePath: string,
    objectName: string,
    properties: Array<{ name: string; type: string }>,
    insertPosition: Position
  ): RefactoringSuggestion {
    const interfaceBody = properties
      .map(p => `  ${p.name}: ${p.type};`)
      .join('\n');
    
    const interfaceCode = `interface ${this.capitalize(objectName)} {\n${interfaceBody}\n}`;
    
    const action: CodeAction = {
      title: `生成接口: ${this.capitalize(objectName)}`,
      kind: CodeActionKind.RefactorRewrite,
      edit: {
        changes: {
          [filePath]: [{
            range: {
              start: insertPosition,
              end: insertPosition
            },
            newText: interfaceCode + '\n\n'
          }]
        }
      }
    };

    return {
      title: `生成接口: ${this.capitalize(objectName)}`,
      description: `从 ${objectName} 对象生成接口定义`,
      action,
      riskLevel: 'low'
    };
  }

  /**
   * 首字母大写
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 获取所有可用的重构建议
   */
  async getAvailableRefactorings(
    filePath: string,
    range: Range,
    context?: {
      selectedText?: string;
      symbolName?: string;
      symbolType?: string;
    }
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // 提取函数建议
    if (context?.selectedText) {
      suggestions.push(
        this.generateExtractFunctionSuggestion({
          filePath,
          range,
          functionName: 'extractedFunction',
          isAsync: context.selectedText.includes('await')
        })
      );

      // 提取变量建议
      suggestions.push(
        this.generateExtractVariableSuggestion(
          filePath,
          range,
          context.selectedText,
          'extractedVar'
        )
      );
    }

    // 重命名建议
    if (context?.symbolName) {
      const renameSuggestions = this.generateRenameSuggestions(
        context.symbolName,
        (context.symbolType as any) || 'variable'
      );
      
      for (const newName of renameSuggestions.slice(0, 3)) {
        suggestions.push({
          title: `重命名为: ${newName}`,
          description: `将 ${context.symbolName} 重命名为 ${newName}`,
          action: {
            title: `重命名为: ${newName}`,
            kind: CodeActionKind.RefactorRewrite
          },
          riskLevel: 'low'
        });
      }
    }

    return suggestions;
  }
}

export default RefactoringEngine;
