/**
 * Refactoring suggestion provider
 * Generates intelligent refactoring recommendations for duplicate code
 */

import { CodeBlock, DuplicateGroup, RefactoringSuggestion } from '../types';

/**
 * Generate refactoring suggestions for a duplicate group
 */
export function generateSuggestions(group: DuplicateGroup): RefactoringSuggestion[] {
  const suggestions: RefactoringSuggestion[] = [];
  
  // Extract function suggestion
  const extractSuggestion = generateExtractFunctionSuggestion(group);
  if (extractSuggestion) {
    suggestions.push(extractSuggestion);
  }
  
  // Create utility class/module suggestion
  const utilitySuggestion = generateUtilitySuggestion(group);
  if (utilitySuggestion) {
    suggestions.push(utilitySuggestion);
  }
  
  // Inheritance/template suggestion for class duplicates
  if (group.blocks[0]?.content.includes('class')) {
    const inheritanceSuggestion = generateInheritanceSuggestion(group);
    if (inheritanceSuggestion) {
      suggestions.push(inheritanceSuggestion);
    }
  }
  
  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Generate "Extract Function" suggestion
 */
function generateExtractFunctionSuggestion(group: DuplicateGroup): RefactoringSuggestion | null {
  const blocks = group.blocks;
  if (blocks.length < 2) return null;
  
  // Analyze the duplicate code to extract common parts
  const commonCode = findCommonCode(blocks);
  if (!commonCode || commonCode.split('\n').length < 2) return null;
  
  // Determine function name based on content
  const functionName = suggestFunctionName(commonCode);
  
  // Generate preview
  const preview = generateExtractFunctionPreview(commonCode, functionName, blocks[0].language);
  
  // Calculate confidence based on similarity and complexity
  const confidence = calculateConfidence(group, 'extract_function');
  
  return {
    type: 'extract_function',
    description: `Extract ${blocks.length} duplicate code blocks into function "${functionName}"`,
    preview,
    confidence
  };
}

/**
 * Generate "Create Utility" suggestion
 */
function generateUtilitySuggestion(group: DuplicateGroup): RefactoringSuggestion | null {
  const blocks = group.blocks;
  if (blocks.length < 2) return null;
  
  // Check if code is utility-like (pure function, no side effects)
  const isUtilityLike = blocks.every(b => isPureFunction(b.content));
  if (!isUtilityLike) return null;
  
  const utilityName = suggestUtilityName(blocks[0].content);
  const preview = generateUtilityPreview(blocks, utilityName);
  const confidence = calculateConfidence(group, 'create_utility') * 0.9;
  
  return {
    type: 'create_utility',
    description: `Create utility module "${utilityName}" for shared functionality`,
    preview,
    confidence
  };
}

/**
 * Generate "Use Inheritance" suggestion for class duplicates
 */
function generateInheritanceSuggestion(group: DuplicateGroup): RefactoringSuggestion | null {
  const blocks = group.blocks;
  if (blocks.length < 2) return null;
  
  // Extract class names
  const classNames = blocks.map(b => extractClassName(b.content)).filter(Boolean);
  if (classNames.length < 2) return null;
  
  const baseClassName = 'Base' + classNames[0];
  const preview = generateInheritancePreview(classNames, baseClassName);
  const confidence = calculateConfidence(group, 'inheritance') * 0.85;
  
  return {
    type: 'inheritance',
    description: `Extract common methods to base class "${baseClassName}"`,
    preview,
    confidence
  };
}

/**
 * Find common code between blocks
 */
function findCommonCode(blocks: CodeBlock[]): string {
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0].content;
  
  // Simple LCS-based approach
  let common = blocks[0].content;
  
  for (let i = 1; i < blocks.length; i++) {
    common = longestCommonSubsequence(common, blocks[i].content);
    if (common.length < 10) break; // Too small to be meaningful
  }
  
  return common.trim();
}

/**
 * Simple LCS implementation for code comparison
 */
function longestCommonSubsequence(str1: string, str2: string): string {
  const lines1 = str1.split('\n');
  const lines2 = str2.split('\n');
  
  const m = lines1.length;
  const n = lines2.length;
  
  // Build LCS matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const line1 = normalizeLine(lines1[i - 1]);
      const line2 = normalizeLine(lines2[j - 1]);
      
      if (line1 === line2) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find LCS
  const result: string[] = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    const line1 = normalizeLine(lines1[i - 1]);
    const line2 = normalizeLine(lines2[j - 1]);
    
    if (line1 === line2) {
      result.unshift(lines1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return result.join('\n');
}

/**
 * Normalize a line for comparison
 */
function normalizeLine(line: string): string {
  return line
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/VAR\d+/g, 'VAR')
    .replace(/FUNC\d+/g, 'FUNC');
}

/**
 * Suggest a function name based on code content
 */
function suggestFunctionName(code: string): string {
  // Look for patterns that suggest the function's purpose
  const patterns = [
    { regex: /validate|check|verify/i, name: 'validate' },
    { regex: /format|parse|convert/i, name: 'format' },
    { regex: /fetch|get|load|request/i, name: 'fetchData' },
    { regex: /save|store|write/i, name: 'saveData' },
    { regex: /calculate|compute|sum/i, name: 'calculate' },
    { regex: /filter|search|find/i, name: 'filterItems' },
    { regex: /sort|order/i, name: 'sortItems' },
    { regex: /transform|map/i, name: 'transform' },
    { regex: /create|make|build/i, name: 'create' },
    { regex: /update|modify/i, name: 'update' },
    { regex: /delete|remove|clear/i, name: 'remove' },
    { regex: /handle|process/i, name: 'handle' },
  ];
  
  for (const pattern of patterns) {
    if (pattern.regex.test(code)) {
      return pattern.name;
    }
  }
  
  return 'extractedFunction';
}

/**
 * Suggest utility name
 */
function suggestUtilityName(code: string): string {
  const funcName = suggestFunctionName(code);
  return funcName.replace(/^[a-z]/, c => c.toUpperCase()) + 'Utils';
}

/**
 * Extract class name from code
 */
function extractClassName(code: string): string | null {
  const match = code.match(/class\s+(\w+)/);
  return match ? match[1] : null;
}

/**
 * Check if code appears to be a pure function
 */
function isPureFunction(code: string): boolean {
  // Simple heuristics - in production would use AST analysis
  const impurePatterns = [
    /console\./,
    /document\./,
    /window\./,
    /localStorage/,
    /fetch\(/,
    /XMLHttpRequest/,
    /setTimeout/,
    /setInterval/,
    /new\s+\w+\(/, // Object construction
    /=\s*require\(/,
    /import\s+/,
  ];
  
  return !impurePatterns.some(p => p.test(code));
}

/**
 * Generate preview for extract function refactoring
 */
function generateExtractFunctionPreview(
  code: string,
  functionName: string,
  language: string
): string {
  const lines = code.split('\n');
  const indent = lines[0].match(/^(\s*)/)?.[1] || '';
  
  let preview = '';
  
  switch (language) {
    case 'javascript':
    case 'typescript':
      preview = `${indent}function ${functionName}() {\n${code}\n${indent}}\n\n${indent}// Usage:\n${indent}${functionName}();`;
      break;
    case 'python':
      preview = `${indent}def ${functionName}():\n${code}\n\n${indent}# Usage:\n${indent}${functionName}()`;
      break;
    case 'java':
    case 'csharp':
      preview = `${indent}private void ${functionName}() {\n${code}\n${indent}}\n\n${indent}// Usage:\n${indent}${functionName}();`;
      break;
    case 'go':
      preview = `${indent}func ${functionName}() {\n${code}\n${indent}}\n\n${indent}// Usage:\n${indent}${functionName}()`;
      break;
    case 'rust':
      preview = `${indent}fn ${functionName}() {\n${code}\n${indent}}\n\n${indent}// Usage:\n${indent}${functionName}();`;
      break;
    default:
      preview = `function ${functionName}() {\n${code}\n}`;
  }
  
  return preview;
}

/**
 * Generate preview for utility creation
 */
function generateUtilityPreview(blocks: CodeBlock[], utilityName: string): string {
  const lang = blocks[0].language;
  const commonCode = findCommonCode(blocks);
  
  let preview = '';
  
  switch (lang) {
    case 'javascript':
    case 'typescript':
      preview = `// ${utilityName}.js\nexport class ${utilityName} {\n  static ${suggestFunctionName(commonCode)}() {\n    ${commonCode.replace(/\n/g, '\n    ')}\n  }\n}\n\n// Usage:\nimport { ${utilityName} } from './${utilityName}';\n${utilityName}.${suggestFunctionName(commonCode)}();`;
      break;
    case 'python':
      preview = `# ${utilityName}.py\nclass ${utilityName}:\n    @staticmethod\n    def ${suggestFunctionName(commonCode)}():\n        ${commonCode.replace(/\n/g, '\n        ')}\n\n# Usage:\nfrom ${utilityName} import ${utilityName}\n${utilityName}.${suggestFunctionName(commonCode)}()`;
      break;
    default:
      preview = `// ${utilityName}\nclass ${utilityName} {\n  // Common functionality\n}`;
  }
  
  return preview;
}

/**
 * Generate preview for inheritance refactoring
 */
function generateInheritancePreview(classNames: string[], baseClassName: string): string {
  return `// Create new base class\nclass ${baseClassName} {\n  // Common methods from ${classNames.join(', ')}\n}\n\n// Update existing classes:\nclass ${classNames[0]} extends ${baseClassName} { ... }\nclass ${classNames[1]} extends ${baseClassName} { ... }`;
}

/**
 * Calculate confidence score for a suggestion
 */
function calculateConfidence(
  group: DuplicateGroup,
  type: RefactoringSuggestion['type']
): number {
  let confidence = group.similarity;
  
  // Adjust based on number of duplicates
  const count = group.blocks.length;
  if (count >= 3) confidence *= 1.1;
  if (count >= 5) confidence *= 1.2;
  
  // Adjust based on suggestion type
  switch (type) {
    case 'extract_function':
      confidence *= 1.0;
      break;
    case 'create_utility':
      confidence *= 0.9;
      break;
    case 'inheritance':
      confidence *= 0.85;
      break;
    case 'template':
      confidence *= 0.8;
      break;
  }
  
  // Cap at 0.99
  return Math.min(confidence, 0.99);
}