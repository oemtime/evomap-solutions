/**
 * 辅助函数
 */

import { Position, Range } from 'vscode-languageserver-protocol';

/**
 * 创建位置对象
 */
export function createPosition(line: number, character: number): Position {
  return { line, character };
}

/**
 * 创建范围对象
 */
export function createRange(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number
): Range {
  return {
    start: createPosition(startLine, startChar),
    end: createPosition(endLine, endChar)
  };
}

/**
 * 检查位置是否在范围内
 */
export function isPositionInRange(position: Position, range: Range): boolean {
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
 * 比较两个位置
 * 返回负数 if pos1 < pos2, 0 if equal, 正数 if pos1 > pos2
 */
export function comparePositions(pos1: Position, pos2: Position): number {
  if (pos1.line !== pos2.line) {
    return pos1.line - pos2.line;
  }
  return pos1.character - pos2.character;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= ms) {
      lastTime = now;
      fn(...args);
    }
  };
}

/**
 * 文件路径转 URI
 */
export function filePathToUri(filePath: string): string {
  // 简单实现，实际应使用 vscode-uri
  if (filePath.startsWith('file://')) {
    return filePath;
  }
  
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return `file://${normalized}`;
  }
  return `file:///${normalized}`;
}

/**
 * URI 转文件路径
 */
export function uriToFilePath(uri: string): string {
  if (uri.startsWith('file://')) {
    return uri.slice(7).replace(/\//g, '/');
  }
  return uri;
}

/**
 * 提取行内容
 */
export function getLineContent(content: string, lineNumber: number): string {
  const lines = content.split('\n');
  return lines[lineNumber] || '';
}

/**
 * 获取位置处的单词
 */
export function getWordAtPosition(content: string, position: Position): string {
  const line = getLineContent(content, position.line);
  
  // 找到单词边界
  let start = position.character;
  let end = position.character;
  
  while (start > 0 && /\w/.test(line[start - 1])) {
    start--;
  }
  
  while (end < line.length && /\w/.test(line[end])) {
    end++;
  }
  
  return line.slice(start, end);
}

/**
 * 格式化错误消息
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * 安全的 JSON 解析
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 深拷贝
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 合并对象
 */
export function mergeObjects<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  return { ...target, ...source };
}

/**
 * 检查值是否为空
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default {
  createPosition,
  createRange,
  isPositionInRange,
  comparePositions,
  delay,
  debounce,
  throttle,
  filePathToUri,
  uriToFilePath,
  getLineContent,
  getWordAtPosition,
  formatError,
  safeJsonParse,
  deepClone,
  mergeObjects,
  isEmpty,
  generateId
};
