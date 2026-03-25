/**
 * Type definitions for Duplicate Code Detector
 */

/**
 * Represents a code block/segment
 */
export interface CodeBlock {
  id: string;
  content: string;
  normalizedContent: string;
  language: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startCharacter: number;
  endCharacter: number;
  ast?: any; // AST representation
  tokens?: string[]; // Tokenized content
}

/**
 * Represents a duplicate code pair/group
 */
export interface DuplicateGroup {
  id: string;
  blocks: CodeBlock[];
  similarity: number; // 0.0 - 1.0
  type: 'exact' | 'similar' | 'semantic';
  suggestedRefactoring?: RefactoringSuggestion;
}

/**
 * Refactoring suggestion
 */
export interface RefactoringSuggestion {
  type: 'extract_function' | 'create_utility' | 'inheritance' | 'template';
  description: string;
  preview: string;
  confidence: number;
  targetFile?: string;
}

/**
 * Configuration options
 */
export interface DetectorConfig {
  enable: boolean;
  similarityThreshold: number;
  minLines: number;
  scanOnSave: boolean;
  scanOnType: boolean;
  languages: string[];
  ignorePatterns: string[];
  showCodeLens: boolean;
  maxDuplicatesToShow: number;
}

/**
 * Scan result for a file
 */
export interface FileScanResult {
  filePath: string;
  duplicates: DuplicateGroup[];
  scanTime: number;
  totalBlocks: number;
}

/**
 * Workspace scan result
 */
export interface WorkspaceScanResult {
  files: FileScanResult[];
  totalDuplicates: number;
  totalFiles: number;
  scanTime: number;
}

/**
 * Similarity metrics
 */
export interface SimilarityMetrics {
  textSimilarity: number;
  astSimilarity: number;
  tokenSimilarity: number;
  combined: number;
}

/**
 * Code chunk for processing
 */
export interface CodeChunk {
  id: string;
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'block' | 'statement';
  parent?: string;
}

/**
 * Detection strategy
 */
export type DetectionStrategy = 'text' | 'ast' | 'token' | 'hybrid';

/**
 * Agent API interface
 */
export interface AgentAPI {
  checkCode(code: string, language: string): Promise<DuplicateCheckResult>;
  getSuggestions(code: string, language: string): Promise<RefactoringSuggestion[]>;
  autoFix(code: string, language: string): Promise<string>;
}

/**
 * Result of duplicate check
 */
export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  duplicates: DuplicateGroup[];
  suggestions: RefactoringSuggestion[];
  context: {
    existingFunctions: string[];
    similarPatterns: string[];
    recommendedExtracts: string[];
  };
}

/**
 * CodeLens data
 */
export interface CodeLensData {
  range: {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  };
  command: {
    title: string;
    command: string;
    arguments?: any[];
  };
  duplicateGroup?: DuplicateGroup;
}

/**
 * Cache entry
 */
export interface CacheEntry {
  result: FileScanResult;
  timestamp: number;
  contentHash: string;
}