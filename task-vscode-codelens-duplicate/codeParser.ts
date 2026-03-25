/**
 * Code parsing utilities
 * Handles language-specific parsing and normalization
 */

import { CodeBlock, CodeChunk } from '../types';
import * as crypto from 'crypto';

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'go',
  'rust',
  'cpp',
  'c',
  'csharp'
];

/**
 * Parse code into blocks based on language
 */
export function parseCodeIntoBlocks(
  code: string,
  language: string,
  filePath: string
): CodeBlock[] {
  const chunks = extractCodeChunks(code, language);
  const blocks: CodeBlock[] = [];
  
  for (const chunk of chunks) {
    const normalized = normalizeCode(chunk.content, language);
    const tokens = tokenizeCode(chunk.content, language);
    
    blocks.push({
      id: generateBlockId(chunk, filePath),
      content: chunk.content,
      normalizedContent: normalized,
      language,
      filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      startCharacter: 0,
      endCharacter: chunk.content.split('\n').pop()?.length || 0,
      tokens
    });
  }
  
  return blocks;
}

/**
 * Extract code chunks (functions, classes, etc.)
 */
export function extractCodeChunks(code: string, language: string): CodeChunk[] {
  const lines = code.split('\n');
  const chunks: CodeChunk[] = [];
  
  // Simple regex-based extraction
  // In production, this would use proper AST parsing
  const patterns = getPatternsForLanguage(language);
  
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern.regex);
      if (match) {
        const endLine = findBlockEnd(lines, i, pattern.type, language);
        const content = lines.slice(i, endLine + 1).join('\n');
        
        chunks.push({
          id: `${i}-${endLine}`,
          content,
          startLine: i,
          endLine,
          type: pattern.type
        });
        
        i = endLine; // Skip to end of this block
        break;
      }
    }
  }
  
  // Also extract sliding window chunks for smaller segments
  const windowSize = 5;
  for (let i = 0; i <= lines.length - windowSize; i++) {
    const content = lines.slice(i, i + windowSize).join('\n');
    
    // Skip if already covered by a larger chunk
    const alreadyCovered = chunks.some(c => 
      c.startLine <= i && c.endLine >= i + windowSize - 1
    );
    
    if (!alreadyCovered && isMeaningfulCode(content)) {
      chunks.push({
        id: `window-${i}`,
        content,
        startLine: i,
        endLine: i + windowSize - 1,
        type: 'block'
      });
    }
  }
  
  return chunks;
}

/**
 * Get regex patterns for different languages
 */
function getPatternsForLanguage(language: string): Array<{ regex: RegExp; type: CodeChunk['type'] }> {
  const commonPatterns = [
    { regex: /^\s*(function|func|def|void|int|string|bool)\s+\w+\s*\(/, type: 'function' as const },
    { regex: /^\s*(class|struct|interface)\s+\w+/, type: 'class' as const },
    { regex: /^\s*(if|for|while|switch)\s*\(/, type: 'block' as const },
  ];
  
  switch (language) {
    case 'javascript':
    case 'typescript':
      return [
        { regex: /^\s*(async\s+)?function\s+\w+\s*\(/, type: 'function' },
        { regex: /^\s*const\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>/, type: 'function' },
        { regex: /^\s*\w+\s*\([^)]*\)\s*\{/, type: 'function' },
        { regex: /^\s*class\s+\w+/, type: 'class' },
        { regex: /^\s*if\s*\(/, type: 'block' },
        { regex: /^\s*for\s*\(/, type: 'block' },
        { regex: /^\s*while\s*\(/, type: 'block' },
      ];
    case 'python':
      return [
        { regex: /^\s*def\s+\w+\s*\(/, type: 'function' },
        { regex: /^\s*class\s+\w+/, type: 'class' },
        { regex: /^\s*if\s+.+:/, type: 'block' },
        { regex: /^\s*for\s+.+:/, type: 'block' },
        { regex: /^\s*while\s+.+:/, type: 'block' },
      ];
    case 'java':
    case 'csharp':
      return [
        { regex: /^\s*(public|private|protected)?\s*(static\s+)?(void|\w+)\s+\w+\s*\(/, type: 'function' },
        { regex: /^\s*(public\s+)?class\s+\w+/, type: 'class' },
        { regex: /^\s*if\s*\(/, type: 'block' },
      ];
    case 'go':
      return [
        { regex: /^\s*func\s+\w+\s*\(/, type: 'function' },
        { regex: /^\s*func\s*\([^)]*\)\s*\w+\s*\(/, type: 'function' },
        { regex: /^\s*type\s+\w+\s+struct/, type: 'class' },
      ];
    case 'rust':
      return [
        { regex: /^\s*fn\s+\w+\s*\(/, type: 'function' },
        { regex: /^\s*(pub\s+)?struct\s+\w+/, type: 'class' },
        { regex: /^\s*(pub\s+)?impl/, type: 'class' },
      ];
    default:
      return commonPatterns;
  }
}

/**
 * Find the end of a code block
 */
function findBlockEnd(
  lines: string[],
  startLine: number,
  type: string,
  language: string
): number {
  if (language === 'python') {
    // Python uses indentation
    const baseIndent = lines[startLine].search(/\S/);
    let i = startLine + 1;
    
    while (i < lines.length) {
      const line = lines[i];
      const indent = line.search(/\S/);
      
      // Empty lines or comments don't count
      if (line.trim() === '' || line.trim().startsWith('#')) {
        i++;
        continue;
      }
      
      // Check if indentation decreased back to base level or less
      if (indent <= baseIndent && line.trim().length > 0) {
        break;
      }
      
      i++;
    }
    
    return i - 1;
  }
  
  // Brace-based languages
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let i = startLine;
  
  for (; i < lines.length; i++) {
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j - 1] : '';
      
      // Handle strings
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
      }
      
      // Count braces only outside strings
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
      }
    }
    
    // If we started with braces and they're all closed, we're done
    if (braceCount === 0 && i > startLine) {
      // Make sure we actually found some braces
      const content = lines.slice(startLine, i + 1).join('\n');
      if (content.includes('{')) {
        break;
      }
    }
  }
  
  return Math.min(i, lines.length - 1);
}

/**
 * Normalize code for comparison
 */
export function normalizeCode(code: string, language: string): string {
  let normalized = code;
  
  // Remove comments
  normalized = removeComments(normalized, language);
  
  // Normalize whitespace
  normalized = normalized
    .replace(/\s+/g, ' ')
    .replace(/;\s*/g, '; ')
    .trim();
  
  // Normalize variable names (replace with placeholders)
  normalized = normalizeIdentifiers(normalized, language);
  
  return normalized;
}

/**
 * Remove comments from code
 */
function removeComments(code: string, language: string): string {
  let result = code;
  
  if (language === 'python') {
    // Python comments
    result = result.replace(/#.*$/gm, '');
  } else {
    // C-style comments
    result = result.replace(/\/\/.*$/gm, '');
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  }
  
  return result;
}

/**
 * Normalize identifiers to generic names
 */
function normalizeIdentifiers(code: string, language: string): string {
  // This is a simplified version
  // In production, this would use AST parsing for more accurate normalization
  
  const patterns = [
    // Variable declarations
    { regex: /\b(var|let|const)\s+(\w+)/g, replacement: '$1 VAR' },
    // Function names
    { regex: /\bfunction\s+(\w+)/g, replacement: 'function FUNC' },
    // Class names
    { regex: /\bclass\s+(\w+)/g, replacement: 'class CLASS' },
  ];
  
  let result = code;
  for (const pattern of patterns) {
    result = result.replace(pattern.regex, pattern.replacement);
  }
  
  return result;
}

/**
 * Tokenize code into tokens
 */
export function tokenizeCode(code: string, language: string): string[] {
  // Simple tokenization
  // In production, this would use a proper tokenizer
  
  const normalized = normalizeCode(code, language);
  
  // Split on common delimiters while preserving some structure
  const tokens = normalized
    .replace(/([{}();,=+\-*/<>!&|])/g, ' $1 ')
    .split(/\s+/)
    .filter(t => t.length > 0);
  
  return tokens;
}

/**
 * Check if code chunk is meaningful (not just whitespace/comments)
 */
function isMeaningfulCode(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length === 0) return false;
  
  // Check if it's all comments
  const lines = trimmed.split('\n');
  const nonCommentLines = lines.filter(line => {
    const trimmedLine = line.trim();
    return trimmedLine.length > 0 && 
           !trimmedLine.startsWith('//') && 
           !trimmedLine.startsWith('#') &&
           !trimmedLine.startsWith('/*') &&
           !trimmedLine.startsWith('*');
  });
  
  return nonCommentLines.length >= 2;
}

/**
 * Generate unique ID for a code block
 */
function generateBlockId(chunk: CodeChunk, filePath: string): string {
  const hash = crypto
    .createHash('md5')
    .update(`${filePath}:${chunk.startLine}:${chunk.content}`)
    .digest('hex')
    .substring(0, 8);
  
  return `${hash}`;
}

/**
 * Get language ID from file path
 */
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp'
  };
  
  return langMap[ext || ''] || 'unknown';
}