/**
 * AST Analyzer
 * Provides AST-based code analysis for more accurate duplicate detection
 */

import { CodeBlock } from '../types';

/**
 * Simplified AST node structure
 */
export interface ASTNode {
  type: string;
  start?: number;
  end?: number;
  children?: ASTNode[];
  value?: string;
  name?: string;
  [key: string]: any;
}

/**
 * Parse code to AST (simplified version)
 * In production, this would use actual parsers like tree-sitter
 */
export function parseToAST(code: string, language: string): ASTNode | null {
  // Simplified parsing - returns a basic structure
  // Production would use tree-sitter or language-specific parsers
  
  try {
    const lines = code.split('\n');
    const root: ASTNode = {
      type: 'Program',
      children: []
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const node = parseLine(line, i, language);
      if (node) {
        root.children!.push(node);
      }
    }
    
    return root;
  } catch (error) {
    console.error('AST parsing error:', error);
    return null;
  }
}

/**
 * Parse a single line to AST node
 */
function parseLine(line: string, lineNumber: number, language: string): ASTNode | null {
  const trimmed = line.trim();
  
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return { type: 'Comment', value: trimmed };
  }
  
  // Function detection
  const funcMatch = trimmed.match(/^(async\s+)?(function|def|func|fn)\s+(\w+)/);
  if (funcMatch) {
    return {
      type: 'FunctionDeclaration',
      name: funcMatch[3],
      async: !!funcMatch[1],
      line: lineNumber
    };
  }
  
  // Class detection
  const classMatch = trimmed.match(/^class\s+(\w+)/);
  if (classMatch) {
    return {
      type: 'ClassDeclaration',
      name: classMatch[1],
      line: lineNumber
    };
  }
  
  // Variable declaration
  const varMatch = trimmed.match(/^(const|let|var|val)\s+(\w+)/);
  if (varMatch) {
    return {
      type: 'VariableDeclaration',
      kind: varMatch[1],
      name: varMatch[2],
      line: lineNumber
    };
  }
  
  // Import/Require
  if (trimmed.match(/^(import|require|from|using)/)) {
    return {
      type: 'ImportDeclaration',
      line: lineNumber
    };
  }
  
  // Control flow
  if (trimmed.match(/^(if|else|for|while|switch|case|try|catch|finally)/)) {
    return {
      type: 'ControlFlow',
      kind: trimmed.split(/\s/)[0],
      line: lineNumber
    };
  }
  
  // Return statement
  if (trimmed.startsWith('return')) {
    return {
      type: 'ReturnStatement',
      line: lineNumber
    };
  }
  
  // Expression/Statement
  return {
    type: 'ExpressionStatement',
    line: lineNumber
  };
}

/**
 * Compare two ASTs for similarity
 */
export function compareASTs(ast1: ASTNode, ast2: ASTNode): number {
  if (!ast1 || !ast2) return 0;
  if (ast1.type !== ast2.type) return 0;
  
  // Exact match
  if (JSON.stringify(ast1) === JSON.stringify(ast2)) {
    return 1.0;
  }
  
  // Compare children
  const children1 = ast1.children || [];
  const children2 = ast2.children || [];
  
  if (children1.length === 0 && children2.length === 0) {
    return 0.8; // Same type, no children
  }
  
  // Calculate similarity based on children
  let matchingChildren = 0;
  const maxChildren = Math.max(children1.length, children2.length);
  
  for (let i = 0; i < Math.min(children1.length, children2.length); i++) {
    const childSim = compareASTs(children1[i], children2[i]);
    if (childSim > 0.7) {
      matchingChildren++;
    }
  }
  
  return maxChildren > 0 ? matchingChildren / maxChildren : 0;
}

/**
 * Extract AST signature for comparison
 */
export function getASTSignature(ast: ASTNode): string {
  if (!ast) return '';
  
  let signature = ast.type;
  
  if (ast.children && ast.children.length > 0) {
    const childSignatures = ast.children.map(getASTSignature);
    signature += '[' + childSignatures.join(',') + ']';
  }
  
  return signature;
}

/**
 * Normalize AST by removing variable names and literals
 */
export function normalizeAST(node: ASTNode): ASTNode {
  if (!node) return node;
  
  const normalized: ASTNode = {
    type: node.type
  };
  
  // Keep structure but normalize values
  if (node.children) {
    normalized.children = node.children.map(normalizeAST);
  }
  
  // Normalize specific node types
  switch (node.type) {
    case 'FunctionDeclaration':
      normalized.name = 'FUNC';
      break;
    case 'VariableDeclaration':
      normalized.name = 'VAR';
      break;
    case 'ClassDeclaration':
      normalized.name = 'CLASS';
      break;
    case 'Literal':
      normalized.value = 'LITERAL';
      break;
    case 'Identifier':
      normalized.name = 'ID';
      break;
  }
  
  return normalized;
}

/**
 * Find similar subtrees in two ASTs
 */
export function findSimilarSubtrees(
  ast1: ASTNode,
  ast2: ASTNode,
  threshold: number = 0.8
): Array<{ node1: ASTNode; node2: ASTNode; similarity: number }> {
  const results: Array<{ node1: ASTNode; node2: ASTNode; similarity: number }> = [];
  
  const nodes1 = flattenAST(ast1);
  const nodes2 = flattenAST(ast2);
  
  for (const n1 of nodes1) {
    for (const n2 of nodes2) {
      const sim = compareASTs(n1, n2);
      if (sim >= threshold) {
        results.push({ node1: n1, node2: n2, similarity: sim });
      }
    }
  }
  
  return results;
}

/**
 * Flatten AST to array of nodes
 */
function flattenAST(node: ASTNode): ASTNode[] {
  const result: ASTNode[] = [node];
  
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenAST(child));
    }
  }
  
  return result;
}

/**
 * Extract code blocks from AST
 */
export function extractBlocksFromAST(
  ast: ASTNode,
  code: string,
  filePath: string
): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  
  function traverse(node: ASTNode, depth: number = 0): void {
    // Extract function and class blocks
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      // In a real implementation, we'd use source maps to get exact positions
      const block: CodeBlock = {
        id: `${filePath}-${node.line || 0}`,
        content: '', // Would extract from source
        normalizedContent: '',
        language: '',
        filePath,
        startLine: node.line || 0,
        endLine: node.line || 0,
        startCharacter: 0,
        endCharacter: 0,
        ast: node
      };
      
      blocks.push(block);
    }
    
    if (node.children) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }
  
  traverse(ast);
  return blocks;
}