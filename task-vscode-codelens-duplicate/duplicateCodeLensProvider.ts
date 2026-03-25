/**
 * CodeLens Provider for Duplicate Code Detection
 * Provides real-time CodeLens hints above duplicate code blocks
 */

import * as vscode from 'vscode';
import { DuplicateGroup, DetectorConfig, CodeBlock } from '../types';
import { parseCodeIntoBlocks, getLanguageFromPath } from '../utils/codeParser';
import { findDuplicates, clusterDuplicates } from '../detectors/similarityDetector';
import { generateSuggestions } from '../refactor/suggestionProvider';

export class DuplicateCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  
  private duplicateGroups: Map<string, DuplicateGroup> = new Map();
  private config: DetectorConfig;
  private scanCache: Map<string, { result: DuplicateGroup[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds
  
  constructor(config: DetectorConfig) {
    this.config = config;
  }
  
  /**
   * Update configuration
   */
  public updateConfig(config: DetectorConfig): void {
    this.config = config;
    this._onDidChangeCodeLenses.fire();
  }
  
  /**
   * Clear cache and refresh
   */
  public refresh(): void {
    this.scanCache.clear();
    this.duplicateGroups.clear();
    this._onDidChangeCodeLenses.fire();
  }
  
  /**
   * Provide CodeLenses for the given document
   */
  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!this.config.enable || !this.config.showCodeLens) {
      return [];
    }
    
    const language = getLanguageFromPath(document.fileName);
    if (!this.config.languages.includes(language)) {
      return [];
    }
    
    // Check cache
    const cacheKey = `${document.fileName}:${document.version}`;
    const cached = this.scanCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return this.createCodeLensesFromGroups(cached.result, document);
    }
    
    // Scan for duplicates
    const groups = await this.scanDocument(document);
    
    if (token.isCancellationRequested) {
      return [];
    }
    
    // Update cache
    this.scanCache.set(cacheKey, { result: groups, timestamp: Date.now() });
    
    return this.createCodeLensesFromGroups(groups, document);
  }
  
  /**
   * Scan document for duplicate code
   */
  private async scanDocument(document: vscode.TextDocument): Promise<DuplicateGroup[]> {
    const code = document.getText();
    const language = getLanguageFromPath(document.fileName);
    
    // Parse into blocks
    const blocks = parseCodeIntoBlocks(code, language, document.fileName);
    
    // Filter blocks by minimum lines
    const validBlocks = blocks.filter(b => 
      b.endLine - b.startLine + 1 >= this.config.minLines
    );
    
    if (validBlocks.length < 2) {
      return [];
    }
    
    // Find duplicates
    const duplicatePairs = findDuplicates(validBlocks, this.config.similarityThreshold);
    
    // Cluster into groups
    const clusters = clusterDuplicates(duplicatePairs);
    
    // Convert to DuplicateGroup format
    const groups: DuplicateGroup[] = clusters.map((cluster, index) => {
      const group: DuplicateGroup = {
        id: `group-${document.fileName}-${index}`,
        blocks: cluster.blocks,
        similarity: cluster.avgSimilarity,
        type: cluster.avgSimilarity > 0.95 ? 'exact' : cluster.avgSimilarity > 0.85 ? 'similar' : 'semantic',
        suggestedRefactoring: undefined
      };
      
      // Generate suggestions
      const suggestions = generateSuggestions(group);
      if (suggestions.length > 0) {
        group.suggestedRefactoring = suggestions[0];
      }
      
      // Store for later reference
      this.duplicateGroups.set(group.id, group);
      
      return group;
    });
    
    return groups;
  }
  
  /**
   * Create CodeLenses from duplicate groups
   */
  private createCodeLensesFromGroups(
    groups: DuplicateGroup[],
    document: vscode.TextDocument
  ): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    
    for (const group of groups) {
      // Limit number of duplicates shown per group
      const blocksToShow = group.blocks.slice(0, this.config.maxDuplicatesToShow);
      
      for (const block of blocksToShow) {
        const range = new vscode.Range(
          block.startLine,
          block.startCharacter,
          block.startLine,
          block.endCharacter
        );
        
        // Main CodeLens showing duplicate count
        const countLens = new vscode.CodeLens(range);
        const duplicateCount = group.blocks.length;
        const otherLocations = duplicateCount - 1;
        
        countLens.command = {
          title: `⚠️ 发现 ${duplicateCount} 处重复代码 (${Math.round(group.similarity * 100)}% 相似)`,
          command: 'duplicateCodeDetector.showDuplicateDetails',
          arguments: [group.id, document.uri]
        };
        
        codeLenses.push(countLens);
        
        // Refactoring suggestion CodeLens
        if (group.suggestedRefactoring) {
          const refactorLens = new vscode.CodeLens(range);
          refactorLens.command = {
            title: `🔧 ${group.suggestedRefactoring.description}`,
            command: 'duplicateCodeDetector.applyRefactoring',
            arguments: [group.id, group.suggestedRefactoring.type]
          };
          
          codeLenses.push(refactorLens);
        }
        
        // Jump to duplicate CodeLens
        if (otherLocations > 0) {
          const jumpLens = new vscode.CodeLens(range);
          jumpLens.command = {
            title: `→ 查看其他 ${otherLocations} 处重复`,
            command: 'duplicateCodeDetector.jumpToDuplicate',
            arguments: [group.id, block.id]
          };
          
          codeLenses.push(jumpLens);
        }
      }
    }
    
    return codeLenses;
  }
  
  /**
   * Get a duplicate group by ID
   */
  public getDuplicateGroup(groupId: string): DuplicateGroup | undefined {
    return this.duplicateGroups.get(groupId);
  }
  
  /**
   * Get all duplicate groups for a file
   */
  public getGroupsForFile(filePath: string): DuplicateGroup[] {
    return Array.from(this.duplicateGroups.values()).filter(g =>
      g.blocks.some(b => b.filePath === filePath)
    );
  }
  
  /**
   * Clear groups for a specific file
   */
  public clearFileCache(filePath: string): void {
    for (const [key, value] of this.scanCache) {
      if (key.startsWith(filePath)) {
        this.scanCache.delete(key);
      }
    }
    
    for (const [id, group] of this.duplicateGroups) {
      if (group.blocks.some(b => b.filePath === filePath)) {
        this.duplicateGroups.delete(id);
      }
    }
  }
}

/**
 * Create CodeLens provider with configuration
 */
export function createDuplicateCodeLensProvider(
  config: DetectorConfig
): DuplicateCodeLensProvider {
  return new DuplicateCodeLensProvider(config);
}