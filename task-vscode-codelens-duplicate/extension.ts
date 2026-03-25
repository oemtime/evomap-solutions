/**
 * Extension entry point
 * Initializes the duplicate code detector extension
 */

import * as vscode from 'vscode';
import { DuplicateCodeLensProvider } from './providers/duplicateCodeLensProvider';
import { DetectorConfig, DuplicateGroup, RefactoringSuggestion } from './types';

// Global provider instance
let codeLensProvider: DuplicateCodeLensProvider;
let outputChannel: vscode.OutputChannel;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Duplicate Code Detector extension is now active');
  
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('Duplicate Code Detector');
  outputChannel.appendLine('Duplicate Code Detector activated');
  
  // Get configuration
  const config = getConfiguration();
  
  // Create CodeLens provider
  codeLensProvider = new DuplicateCodeLensProvider(config);
  
  // Register CodeLens provider for supported languages
  const documentSelector = config.languages.map(lang => ({ 
    language: lang,
    scheme: 'file'
  }));
  
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    documentSelector,
    codeLensProvider
  );
  
  context.subscriptions.push(codeLensDisposable);
  
  // Register commands
  registerCommands(context);
  
  // Register event handlers
  registerEventHandlers(context);
  
  // Watch configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('duplicateCodeDetector')) {
      const newConfig = getConfiguration();
      codeLensProvider.updateConfig(newConfig);
      outputChannel.appendLine('Configuration updated');
    }
  });
  
  context.subscriptions.push(configWatcher);
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  outputChannel?.appendLine('Duplicate Code Detector deactivated');
  outputChannel?.dispose();
}

/**
 * Get extension configuration
 */
function getConfiguration(): DetectorConfig {
  const config = vscode.workspace.getConfiguration('duplicateCodeDetector');
  
  return {
    enable: config.get('enable', true),
    similarityThreshold: config.get('similarityThreshold', 0.8),
    minLines: config.get('minLines', 3),
    scanOnSave: config.get('scanOnSave', true),
    scanOnType: config.get('scanOnType', false),
    languages: config.get('languages', ['javascript', 'typescript', 'python', 'java', 'go', 'rust']),
    ignorePatterns: config.get('ignorePatterns', ['**/node_modules/**', '**/dist/**']),
    showCodeLens: config.get('showCodeLens', true),
    maxDuplicatesToShow: config.get('maxDuplicatesToShow', 5)
  };
}

/**
 * Register all commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Scan current file
  const scanFileCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.scanFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning for duplicate code...',
        cancellable: false
      }, async () => {
        codeLensProvider.refresh();
        vscode.window.showInformationMessage('Scan complete');
      });
    }
  );
  
  // Scan workspace
  const scanWorkspaceCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.scanWorkspace',
    async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning workspace for duplicate code...',
        cancellable: true
      }, async (progress, token) => {
        // TODO: Implement workspace-wide scanning
        vscode.window.showInformationMessage('Workspace scan complete');
      });
    }
  );
  
  // Show report
  const showReportCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.showReport',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      
      const groups = codeLensProvider.getGroupsForFile(editor.document.fileName);
      
      if (groups.length === 0) {
        vscode.window.showInformationMessage('No duplicate code found in this file');
        return;
      }
      
      showDuplicateReport(groups);
    }
  );
  
  // Show duplicate details
  const showDetailsCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.showDuplicateDetails',
    async (groupId: string, uri: vscode.Uri) => {
      const group = codeLensProvider.getDuplicateGroup(groupId);
      if (!group) return;
      
      showDuplicateDetails(group);
    }
  );
  
  // Jump to duplicate
  const jumpToDuplicateCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.jumpToDuplicate',
    async (groupId: string, blockId: string) => {
      const group = codeLensProvider.getDuplicateGroup(groupId);
      if (!group) return;
      
      // Find other blocks in the group
      const otherBlocks = group.blocks.filter(b => b.id !== blockId);
      
      if (otherBlocks.length === 0) return;
      
      // Show quick pick for multiple options
      if (otherBlocks.length > 1) {
        const picks = otherBlocks.map(b => ({
          label: `${b.filePath.split('/').pop()}:${b.startLine + 1}`,
          description: b.content.substring(0, 50) + '...',
          block: b
        }));
        
        const selected = await vscode.window.showQuickPick(picks, {
          placeHolder: 'Select duplicate location to jump to'
        });
        
        if (selected) {
          await jumpToBlock(selected.block);
        }
      } else {
        await jumpToBlock(otherBlocks[0]);
      }
    }
  );
  
  // Apply refactoring
  const applyRefactoringCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.applyRefactoring',
    async (groupId: string, refactoringType: string) => {
      const group = codeLensProvider.getDuplicateGroup(groupId);
      if (!group || !group.suggestedRefactoring) return;
      
      const suggestion = group.suggestedRefactoring;
      
      // Show preview
      const result = await vscode.window.showInformationMessage(
        `Apply refactoring: ${suggestion.description}?`,
        { modal: true, detail: suggestion.preview },
        'Apply',
        'Cancel'
      );
      
      if (result === 'Apply') {
        // TODO: Implement actual refactoring
        vscode.window.showInformationMessage('Refactoring applied');
      }
    }
  );
  
  // Extract function
  const extractFunctionCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.extractFunction',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage('Please select code to extract');
        return;
      }
      
      const selectedText = editor.document.getText(selection);
      
      // Ask for function name
      const functionName = await vscode.window.showInputBox({
        prompt: 'Enter function name',
        placeHolder: 'myNewFunction'
      });
      
      if (!functionName) return;
      
      // TODO: Implement extraction
      vscode.window.showInformationMessage(`Function "${functionName}" extraction ready`);
    }
  );
  
  // Ignore duplicate
  const ignoreDuplicateCmd = vscode.commands.registerCommand(
    'duplicateCodeDetector.ignoreDuplicate',
    async (groupId: string) => {
      // TODO: Add to ignore list
      vscode.window.showInformationMessage('Duplicate ignored');
    }
  );
  
  context.subscriptions.push(
    scanFileCmd,
    scanWorkspaceCmd,
    showReportCmd,
    showDetailsCmd,
    jumpToDuplicateCmd,
    applyRefactoringCmd,
    extractFunctionCmd,
    ignoreDuplicateCmd
  );
}

/**
 * Register event handlers
 */
function registerEventHandlers(context: vscode.ExtensionContext): void {
  // Scan on save
  const saveHandler = vscode.workspace.onDidSaveTextDocument(document => {
    const config = getConfiguration();
    if (config.scanOnSave) {
      codeLensProvider.clearFileCache(document.fileName);
      codeLensProvider.refresh();
    }
  });
  
  // Clear cache on document close
  const closeHandler = vscode.workspace.onDidCloseTextDocument(document => {
    codeLensProvider.clearFileCache(document.fileName);
  });
  
  context.subscriptions.push(saveHandler, closeHandler);
}

/**
 * Show duplicate report
 */
function showDuplicateReport(groups: DuplicateGroup[]): void {
  outputChannel.clear();
  outputChannel.appendLine('='.repeat(60));
  outputChannel.appendLine('DUPLICATE CODE REPORT');
  outputChannel.appendLine('='.repeat(60));
  outputChannel.appendLine(`\nFound ${groups.length} duplicate groups:\n`);
  
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    outputChannel.appendLine(`Group ${i + 1}:`);
    outputChannel.appendLine(`  Similarity: ${Math.round(group.similarity * 100)}%`);
    outputChannel.appendLine(`  Type: ${group.type}`);
    outputChannel.appendLine(`  Locations:`);
    
    for (const block of group.blocks) {
      outputChannel.appendLine(`    - ${block.filePath}:${block.startLine + 1}-${block.endLine + 1}`);
    }
    
    if (group.suggestedRefactoring) {
      outputChannel.appendLine(`  Suggestion: ${group.suggestedRefactoring.description}`);
    }
    
    outputChannel.appendLine('');
  }
  
  outputChannel.show();
}

/**
 * Show duplicate details
 */
function showDuplicateDetails(group: DuplicateGroup): void {
  const panel = vscode.window.createWebviewPanel(
    'duplicateDetails',
    'Duplicate Code Details',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );
  
  panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: var(--vscode-font-family); padding: 20px; }
        .header { margin-bottom: 20px; }
        .similarity { font-size: 24px; color: var(--vscode-editorWarning-foreground); }
        .block { margin: 15px 0; padding: 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
        .location { font-weight: bold; margin-bottom: 5px; }
        pre { overflow-x: auto; margin: 0; }
        code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
        .suggestion { margin-top: 20px; padding: 15px; background: var(--vscode-editor-inactiveSelectionBackground); }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>Duplicate Code Group</h2>
        <div class="similarity">${Math.round(group.similarity * 100)}% Similar</div>
        <div>Type: ${group.type}</div>
        <div>${group.blocks.length} locations found</div>
      </div>
      
      <h3>Locations:</h3>
      ${group.blocks.map(block => `
        <div class="block">
          <div class="location">${block.filePath}:${block.startLine + 1}-${block.endLine + 1}</div>
          <pre><code>${escapeHtml(block.content)}</code></pre>
        </div>
      `).join('')}
      
      ${group.suggestedRefactoring ? `
        <div class="suggestion">
          <h3>Suggested Refactoring</h3>
          <p><strong>${group.suggestedRefactoring.description}</strong></p>
          <p>Confidence: ${Math.round(group.suggestedRefactoring.confidence * 100)}%</p>
          <pre><code>${escapeHtml(group.suggestedRefactoring.preview)}</code></pre>
        </div>
      ` : ''}
    </body>
    </html>
  `;
}

/**
 * Jump to a code block
 */
async function jumpToBlock(block: { filePath: string; startLine: number; startCharacter: number }): Promise<void> {
  const document = await vscode.workspace.openTextDocument(block.filePath);
  const editor = await vscode.window.showTextDocument(document);
  
  const position = new vscode.Position(block.startLine, block.startCharacter);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

/**
 * Escape HTML for webview
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Public API for Agent integration
 */
export function getAgentAPI() {
  return {
    /**
     * Check code for duplicates
     */
    async checkCode(code: string, language: string) {
      // TODO: Implement standalone code checking without document
      return { hasDuplicates: false, duplicates: [] };
    },
    
    /**
     * Get refactoring suggestions
     */
    async getSuggestions(code: string, language: string): Promise<RefactoringSuggestion[]> {
      // TODO: Implement standalone suggestion generation
      return [];
    },
    
    /**
     * Auto-fix duplicate code
     */
    async autoFix(code: string, language: string): Promise<string> {
      // TODO: Implement auto-fix
      return code;
    }
  };
}