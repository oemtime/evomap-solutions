/**
 * Similarity detection algorithms
 * Implements multiple similarity metrics for code comparison
 */

import { CodeBlock, SimilarityMetrics } from '../types';

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate normalized Levenshtein similarity (0.0 - 1.0)
 */
export function textSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Calculate Jaccard similarity between two token sets
 */
export function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  if (union.size === 0) return 0.0;
  
  return intersection.size / union.size;
}

/**
 * Calculate cosine similarity between two token frequency vectors
 */
export function cosineSimilarity(tokens1: string[], tokens2: string[]): number {
  const freq1 = getTokenFrequency(tokens1);
  const freq2 = getTokenFrequency(tokens2);
  
  const allTokens = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (const token of allTokens) {
    const v1 = freq1[token] || 0;
    const v2 = freq2[token] || 0;
    
    dotProduct += v1 * v2;
    mag1 += v1 * v1;
    mag2 += v2 * v2;
  }
  
  if (mag1 === 0 || mag2 === 0) return 0.0;
  
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

/**
 * Get token frequency map
 */
function getTokenFrequency(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const token of tokens) {
    freq[token] = (freq[token] || 0) + 1;
  }
  return freq;
}

/**
 * Calculate AST similarity using tree edit distance approximation
 * This is a simplified version - full implementation would use proper tree edit distance
 */
export function astSimilarity(ast1: any, ast2: any): number {
  if (!ast1 || !ast2) return 0.0;
  
  const structure1 = getASTStructure(ast1);
  const structure2 = getASTStructure(ast2);
  
  return textSimilarity(structure1, structure2);
}

/**
 * Extract simplified AST structure as string
 */
function getASTStructure(node: any): string {
  if (!node || typeof node !== 'object') return '';
  
  let result = node.type || '';
  
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      result += '|' + getASTStructure(child);
    }
  }
  
  if (node.body && Array.isArray(node.body)) {
    for (const child of node.body) {
      result += '|' + getASTStructure(child);
    }
  }
  
  return result;
}

/**
 * Calculate all similarity metrics between two code blocks
 */
export function calculateSimilarityMetrics(
  block1: CodeBlock,
  block2: CodeBlock
): SimilarityMetrics {
  const textSim = textSimilarity(block1.normalizedContent, block2.normalizedContent);
  
  const tokenSim = block1.tokens && block2.tokens
    ? cosineSimilarity(block1.tokens, block2.tokens)
    : 0.0;
  
  const astSim = block1.ast && block2.ast
    ? astSimilarity(block1.ast, block2.ast)
    : 0.0;
  
  // Weighted combination
  const combined = (textSim * 0.4) + (tokenSim * 0.3) + (astSim * 0.3);
  
  return {
    textSimilarity: textSim,
    tokenSimilarity: tokenSim,
    astSimilarity: astSim,
    combined
  };
}

/**
 * Check if two blocks are duplicates based on threshold
 */
export function isDuplicate(
  block1: CodeBlock,
  block2: CodeBlock,
  threshold: number
): boolean {
  const metrics = calculateSimilarityMetrics(block1, block2);
  return metrics.combined >= threshold;
}

/**
 * Find all duplicate pairs in a list of code blocks
 */
export function findDuplicates(
  blocks: CodeBlock[],
  threshold: number
): Array<{ block1: CodeBlock; block2: CodeBlock; similarity: number }> {
  const duplicates: Array<{ block1: CodeBlock; block2: CodeBlock; similarity: number }> = [];
  
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const metrics = calculateSimilarityMetrics(blocks[i], blocks[j]);
      
      if (metrics.combined >= threshold) {
        duplicates.push({
          block1: blocks[i],
          block2: blocks[j],
          similarity: metrics.combined
        });
      }
    }
  }
  
  return duplicates;
}

/**
 * Group duplicate pairs into clusters
 */
export function clusterDuplicates(
  pairs: Array<{ block1: CodeBlock; block2: CodeBlock; similarity: number }>
): Array<{ blocks: CodeBlock[]; avgSimilarity: number }> {
  const clusters: Map<string, Set<CodeBlock>> = new Map();
  const similarities: Map<string, number[]> = new Map();
  
  for (const pair of pairs) {
    const key1 = pair.block1.id;
    const key2 = pair.block2.id;
    
    // Find or create clusters
    let cluster1 = findClusterForBlock(clusters, pair.block1);
    let cluster2 = findClusterForBlock(clusters, pair.block2);
    
    if (!cluster1 && !cluster2) {
      // Create new cluster
      const clusterId = key1;
      clusters.set(clusterId, new Set([pair.block1, pair.block2]));
      similarities.set(clusterId, [pair.similarity]);
    } else if (cluster1 && !cluster2) {
      clusters.get(cluster1)!.add(pair.block2);
      similarities.get(cluster1)!.push(pair.similarity);
    } else if (!cluster1 && cluster2) {
      clusters.get(cluster2)!.add(pair.block1);
      similarities.get(cluster2)!.push(pair.similarity);
    } else if (cluster1 !== cluster2) {
      // Merge clusters
      const set1 = clusters.get(cluster1)!;
      const set2 = clusters.get(cluster2)!;
      const sims1 = similarities.get(cluster1)!;
      const sims2 = similarities.get(cluster2)!;
      
      for (const block of set2) {
        set1.add(block);
      }
      similarities.set(cluster1, [...sims1, ...sims2, pair.similarity]);
      clusters.delete(cluster2);
      similarities.delete(cluster2);
    }
  }
  
  // Convert to result format
  return Array.from(clusters.entries()).map(([id, blocks]) => {
    const sims = similarities.get(id) || [];
    const avgSimilarity = sims.reduce((a, b) => a + b, 0) / sims.length;
    
    return {
      blocks: Array.from(blocks),
      avgSimilarity
    };
  });
}

/**
 * Find which cluster contains a block
 */
function findClusterForBlock(
  clusters: Map<string, Set<CodeBlock>>,
  block: CodeBlock
): string | null {
  for (const [id, blocks] of clusters) {
    for (const b of blocks) {
      if (b.id === block.id) {
        return id;
      }
    }
  }
  return null;
}