/**
 * 代码补全引擎
 * 
 * 提供智能代码补全和建议
 */

import { LSPClient } from './LSPClient';
import { 
  CompletionItem, 
  CompletionList, 
  InsertTextFormat,
  CompletionItemKind 
} from 'vscode-languageserver-protocol';

export interface CompletionContext {
  /** 触发字符 */
  triggerCharacter?: string;
  /** 触发类型 */
  triggerKind?: 'invoked' | 'character' | 'forIncompleteCompletions';
}

export interface EnhancedCompletionItem extends CompletionItem {
  /** 类型信息 */
  typeInfo?: string;
  /** 导入路径 */
  importPath?: string;
  /** 是否是 Snippet */
  isSnippet?: boolean;
  /** 匹配分数 */
  score?: number;
}

export class CodeCompletionEngine {
  private client: LSPClient;

  // 常用代码片段
  private static readonly SNIPPETS: Record<string, {
    prefix: string;
    body: string;
    description: string;
    kind: CompletionItemKind;
  }> = {
    'import-default': {
      prefix: 'imp',
      body: "import ${1:name} from '${2:module}';",
      description: '导入默认导出',
      kind: CompletionItemKind.Snippet
    },
    'import-named': {
      prefix: 'imn',
      body: "import { ${1:name} } from '${2:module}';",
      description: '导入命名导出',
      kind: CompletionItemKind.Snippet
    },
    'import-all': {
      prefix: 'ima',
      body: "import * as ${1:name} from '${2:module}';",
      description: '导入所有导出',
      kind: CompletionItemKind.Snippet
    },
    'export-default': {
      prefix: 'exp',
      body: 'export default ${1:value};',
      description: '默认导出',
      kind: CompletionItemKind.Snippet
    },
    'export-named': {
      prefix: 'exn',
      body: 'export { ${1:name} };',
      description: '命名导出',
      kind: CompletionItemKind.Snippet
    },
    'function': {
      prefix: 'fn',
      body: [
        'function ${1:name}(${2:params}) {',
        '\t${0:// body}',
        '}'
      ].join('\n'),
      description: '函数声明',
      kind: CompletionItemKind.Snippet
    },
    'arrow-function': {
      prefix: 'afn',
      body: [
        'const ${1:name} = (${2:params}) => {',
        '\t${0:// body}',
        '};'
      ].join('\n'),
      description: '箭头函数',
      kind: CompletionItemKind.Snippet
    },
    'async-function': {
      prefix: 'afnasync',
      body: [
        'async function ${1:name}(${2:params}) {',
        '\t${0:// body}',
        '}'
      ].join('\n'),
      description: '异步函数',
      kind: CompletionItemKind.Snippet
    },
    'class': {
      prefix: 'class',
      body: [
        'class ${1:Name} {',
        '\tconstructor(${2:params}) {',
        '\t\t${0:// initialization}',
        '\t}',
        '}'
      ].join('\n'),
      description: '类定义',
      kind: CompletionItemKind.Snippet
    },
    'interface': {
      prefix: 'interface',
      body: [
        'interface ${1:Name} {',
        '\t${0:// properties}',
        '}'
      ].join('\n'),
      description: '接口定义',
      kind: CompletionItemKind.Snippet
    },
    'type-alias': {
      prefix: 'type',
      body: 'type ${1:Name} = ${2:type};',
      description: '类型别名',
      kind: CompletionItemKind.Snippet
    },
    'console-log': {
      prefix: 'clg',
      body: 'console.log(${1:value});',
      description: '控制台输出',
      kind: CompletionItemKind.Snippet
    },
    'console-error': {
      prefix: 'cer',
      body: 'console.error(${1:value});',
      description: '控制台错误',
      kind: CompletionItemKind.Snippet
    },
    'try-catch': {
      prefix: 'try',
      body: [
        'try {',
        '\t${1:// try block}',
        '} catch (${2:error}) {',
        '\t${0:// catch block}',
        '}'
      ].join('\n'),
      description: 'try-catch 块',
      kind: CompletionItemKind.Snippet
    },
    'for-loop': {
      prefix: 'for',
      body: [
        'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {',
        '\t${0:// loop body}',
        '}'
      ].join('\n'),
      description: 'for 循环',
      kind: CompletionItemKind.Snippet
    },
    'for-of': {
      prefix: 'forof',
      body: [
        'for (const ${1:item} of ${2:iterable}) {',
        '\t${0:// loop body}',
        '}'
      ].join('\n'),
      description: 'for-of 循环',
      kind: CompletionItemKind.Snippet
    },
    'for-in': {
      prefix: 'forin',
      body: [
        'for (const ${1:key} in ${2:object}) {',
        '\t${0:// loop body}',
        '}'
      ].join('\n'),
      description: 'for-in 循环',
      kind: CompletionItemKind.Snippet
    },
    'if-statement': {
      prefix: 'if',
      body: [
        'if (${1:condition}) {',
        '\t${0:// if body}',
        '}'
      ].join('\n'),
      description: 'if 语句',
      kind: CompletionItemKind.Snippet
    },
    'if-else': {
      prefix: 'ife',
      body: [
        'if (${1:condition}) {',
        '\t${2:// if body}',
        '} else {',
        '\t${0:// else body}',
        '}'
      ].join('\n'),
      description: 'if-else 语句',
      kind: CompletionItemKind.Snippet
    },
    'switch': {
      prefix: 'switch',
      body: [
        'switch (${1:expression}) {',
        '\tcase ${2:value}:',
        '\t\t${0:// case body}',
        '\t\tbreak;',
        '\tdefault:',
        '\t\tbreak;',
        '}'
      ].join('\n'),
      description: 'switch 语句',
      kind: CompletionItemKind.Snippet
    },
    'promise': {
      prefix: 'prom',
      body: [
        'new Promise((resolve, reject) => {',
        '\t${0:// promise body}',
        '})'
      ].join('\n'),
      description: 'Promise 构造函数',
      kind: CompletionItemKind.Snippet
    },
    'settimeout': {
      prefix: 'stt',
      body: 'setTimeout(() => {\n\t${0:// timeout body}\n}, ${1:delay});',
      description: 'setTimeout',
      kind: CompletionItemKind.Snippet
    },
    'setinterval': {
      prefix: 'sti',
      body: 'setInterval(() => {\n\t${0:// interval body}\n}, ${1:delay});',
      description: 'setInterval',
      kind: CompletionItemKind.Snippet
    },
    'describe': {
      prefix: 'desc',
      body: [
        "describe('${1:description}', () => {",
        '\t${0:// test cases}',
        '});'
      ].join('\n'),
      description: '测试套件',
      kind: CompletionItemKind.Snippet
    },
    'it': {
      prefix: 'it',
      body: [
        "it('should ${1:do something}', () => {",
        '\t${0:// test body}',
        '});'
      ].join('\n'),
      description: '测试用例',
      kind: CompletionItemKind.Snippet
    },
    'async-it': {
      prefix: 'ita',
      body: [
        "it('should ${1:do something}', async () => {",
        '\t${0:// test body}',
        '});'
      ].join('\n'),
      description: '异步测试用例',
      kind: CompletionItemKind.Snippet
    }
  };

  constructor(client: LSPClient) {
    this.client = client;
  }

  /**
   * 解析补全结果
   */
  parseCompletions(result: CompletionItem[] | CompletionList | null): EnhancedCompletionItem[] {
    if (!result) {
      return [];
    }

    const items: CompletionItem[] = Array.isArray(result) ? result : result.items;
    
    return items.map(item => ({
      ...item,
      typeInfo: this.extractTypeInfo(item),
      isSnippet: item.insertTextFormat === InsertTextFormat.Snippet
    }));
  }

  /**
   * 提取类型信息
   */
  private extractTypeInfo(item: CompletionItem): string | undefined {
    // 从 detail 或 documentation 中提取类型信息
    if (item.detail) {
      return item.detail;
    }
    
    if (typeof item.documentation === 'string') {
      return item.documentation;
    }
    
    if (item.documentation && 'value' in item.documentation) {
      return item.documentation.value;
    }
    
    return undefined;
  }

  /**
   * 获取代码片段补全
   */
  getSnippetCompletions(prefix: string): EnhancedCompletionItem[] {
    const completions: EnhancedCompletionItem[] = [];
    
    for (const [key, snippet] of Object.entries(CodeCompletionEngine.SNIPPETS)) {
      if (snippet.prefix.startsWith(prefix) || prefix === '') {
        completions.push({
          label: snippet.prefix,
          kind: snippet.kind,
          detail: snippet.description,
          insertText: snippet.body,
          insertTextFormat: InsertTextFormat.Snippet,
          isSnippet: true
        });
      }
    }
    
    return completions;
  }

  /**
   * 根据上下文过滤补全项
   */
  filterCompletions(
    items: EnhancedCompletionItem[],
    prefix: string,
    context?: CompletionContext
  ): EnhancedCompletionItem[] {
    if (!prefix) {
      return items;
    }

    const lowerPrefix = prefix.toLowerCase();
    
    return items
      .map(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        const lowerLabel = label.toLowerCase();
        
        // 计算匹配分数
        let score = 0;
        
        // 完全匹配
        if (lowerLabel === lowerPrefix) {
          score = 100;
        }
        // 前缀匹配
        else if (lowerLabel.startsWith(lowerPrefix)) {
          score = 80;
        }
        // 包含匹配
        else if (lowerLabel.includes(lowerPrefix)) {
          score = 50;
        }
        // 模糊匹配
        else if (this.fuzzyMatch(lowerLabel, lowerPrefix)) {
          score = 30;
        }
        
        return { ...item, score };
      })
      .filter(item => (item.score || 0) > 0)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * 模糊匹配
   */
  private fuzzyMatch(text: string, pattern: string): boolean {
    let patternIndex = 0;
    for (let i = 0; i < text.length && patternIndex < pattern.length; i++) {
      if (text[i] === pattern[patternIndex]) {
        patternIndex++;
      }
    }
    return patternIndex === pattern.length;
  }

  /**
   * 根据类型过滤补全项
   */
  filterByType(
    items: EnhancedCompletionItem[],
    expectedType: string
  ): EnhancedCompletionItem[] {
    return items.filter(item => {
      const typeInfo = item.typeInfo || '';
      
      // 类型匹配
      if (typeInfo.includes(expectedType)) {
        return true;
      }
      
      // 函数类型匹配
      if (expectedType.includes('=>') && typeInfo.includes('=>')) {
        return true;
      }
      
      return false;
    });
  }

  /**
   * 格式化补全项显示
   */
  formatCompletionItem(item: EnhancedCompletionItem): string {
    const label = typeof item.label === 'string' ? item.label : item.label.label;
    const typeInfo = item.typeInfo ? ` : ${item.typeInfo}` : '';
    const kind = item.kind !== undefined ? `[${this.kindToString(item.kind)}]` : '';
    
    return `${label}${typeInfo} ${kind}`;
  }

  /**
   * 补全项类型转字符串
   */
  private kindToString(kind: CompletionItemKind): string {
    const kinds: Record<CompletionItemKind, string> = {
      [CompletionItemKind.Text]: 'text',
      [CompletionItemKind.Method]: 'method',
      [CompletionItemKind.Function]: 'function',
      [CompletionItemKind.Constructor]: 'constructor',
      [CompletionItemKind.Field]: 'field',
      [CompletionItemKind.Variable]: 'variable',
      [CompletionItemKind.Class]: 'class',
      [CompletionItemKind.Interface]: 'interface',
      [CompletionItemKind.Module]: 'module',
      [CompletionItemKind.Property]: 'property',
      [CompletionItemKind.Unit]: 'unit',
      [CompletionItemKind.Value]: 'value',
      [CompletionItemKind.Enum]: 'enum',
      [CompletionItemKind.Keyword]: 'keyword',
      [CompletionItemKind.Snippet]: 'snippet',
      [CompletionItemKind.Color]: 'color',
      [CompletionItemKind.File]: 'file',
      [CompletionItemKind.Reference]: 'reference',
      [CompletionItemKind.Folder]: 'folder',
      [CompletionItemKind.EnumMember]: 'enumMember',
      [CompletionItemKind.Constant]: 'constant',
      [CompletionItemKind.Struct]: 'struct',
      [CompletionItemKind.Event]: 'event',
      [CompletionItemKind.Operator]: 'operator',
      [CompletionItemKind.TypeParameter]: 'typeParameter'
    };
    
    return kinds[kind] || 'unknown';
  }

  /**
   * 获取导入补全
   */
  getImportCompletions(moduleName: string): EnhancedCompletionItem[] {
    // 这里可以集成 npm 包搜索或本地模块分析
    const commonModules = [
      { name: 'react', exports: ['useState', 'useEffect', 'useContext', 'useReducer'] },
      { name: 'lodash', exports: ['debounce', 'throttle', 'cloneDeep', 'merge'] },
      { name: 'fs', exports: ['readFile', 'writeFile', 'existsSync', 'mkdirSync'] },
      { name: 'path', exports: ['join', 'resolve', 'basename', 'dirname'] }
    ];

    const completions: EnhancedCompletionItem[] = [];
    
    for (const mod of commonModules) {
      if (mod.name.includes(moduleName) || moduleName === '') {
        for (const exp of mod.exports) {
          completions.push({
            label: exp,
            kind: CompletionItemKind.Function,
            detail: `from '${mod.name}'`,
            importPath: mod.name
          });
        }
      }
    }
    
    return completions;
  }
}

export default CodeCompletionEngine;
