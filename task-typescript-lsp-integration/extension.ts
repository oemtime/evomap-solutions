/**
 * VSCode 扩展示例
 * 
 * 展示如何在 VSCode 扩展中集成 TypeScript Agent
 */

import * as vscode from 'vscode';
import { TypeScriptAgent, TypeScriptAgentConfig } from 'typescript-agent-lsp';
import * as path from 'path';

let agent: TypeScriptAgent | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('TypeScript Agent extension is now active');

  // 初始化 TypeScript Agent
  initializeAgent();

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('typescriptAgent.showType', showTypeAtCursor),
    vscode.commands.registerCommand('typescriptAgent.showErrors', showErrors),
    vscode.commands.registerCommand('typescriptAgent.fixAll', fixAllErrors),
    vscode.commands.registerCommand('typescriptAgent.renameSymbol', renameSymbol),
    vscode.commands.registerCommand('typescriptAgent.getCompletions', showCompletions)
  );

  // 注册悬停提供器
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['typescript', 'typescriptreact'],
      {
        provideHover(document, position) {
          return provideTypeHover(document, position);
        }
      }
    )
  );

  // 注册代码操作提供器
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ['typescript', 'typescriptreact'],
      {
        provideCodeActions(document, range, context) {
          return provideCodeActions(document, range, context);
        }
      }
    )
  );

  // 监听文档变化
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(onDocumentOpen),
    vscode.workspace.onDidChangeTextDocument(onDocumentChange),
    vscode.workspace.onDidCloseTextDocument(onDocumentClose)
  );
}

export function deactivate() {
  agent?.stop();
}

/**
 * 初始化 Agent
 */
async function initializeAgent() {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const config: TypeScriptAgentConfig = {
    lsp: {
      serverPath: 'typescript-language-server',
      serverArgs: ['--stdio'],
      rootPath: workspaceRoot,
      onLog: (message, level) => {
        console.log(`[${level}] ${message}`);
      }
    },
    features: {
      typeInference: true,
      errorDetection: true,
      codeCompletion: true,
      refactoring: true,
      autoFix: true
    },
    editor: 'vscode'
  };

  agent = new TypeScriptAgent(config);
  
  agent.on('ready', () => {
    vscode.window.showInformationMessage('TypeScript Agent is ready');
  });

  agent.on('error', (error) => {
    vscode.window.showErrorMessage(`TypeScript Agent error: ${error}`);
  });

  await agent.start();
}

/**
 * 显示光标位置的类型
 */
async function showTypeAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !agent) return;

  const position = editor.selection.active;
  const document = editor.document;

  try {
    const typeInfo = await agent.getTypeAtPosition(
      document.fileName,
      position.line,
      position.character
    );

    if (typeInfo) {
      const message = typeInfo.name 
        ? `${typeInfo.name}: ${typeInfo.type}`
        : typeInfo.type;
      
      vscode.window.showInformationMessage(message);
    } else {
      vscode.window.showInformationMessage('No type information available');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

/**
 * 显示文档错误
 */
async function showErrors() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !agent) return;

  try {
    const errors = await agent.getErrors(editor.document.fileName);
    
    if (errors.length === 0) {
      vscode.window.showInformationMessage('No errors found!');
      return;
    }

    const items = errors.map(e => ({
      label: `[${e.severity.toUpperCase()}] ${e.message}`,
      description: `Line ${e.range.start.line + 1}`,
      detail: `Code: ${e.code}`
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Found ${errors.length} error(s)`
    });

    if (selected) {
      const error = errors.find(e => e.message === selected.label.replace(/^\[\w+\] /, ''));
      if (error) {
        const position = new vscode.Position(
          error.range.start.line,
          error.range.start.character
        );
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

/**
 * 修复所有错误
 */
async function fixAllErrors() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !agent) return;

  try {
    const result = await agent.fixAll(editor.document.fileName);
    vscode.window.showInformationMessage(
      `Fixed ${result.applied} error(s), ${result.failed} failed`
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

/**
 * 重命名符号
 */
async function renameSymbol() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !agent) return;

  const position = editor.selection.active;
  const newName = await vscode.window.showInputBox({
    prompt: 'Enter new name'
  });

  if (!newName) return;

  try {
    const edit = await agent.renameSymbol(
      editor.document.fileName,
      position.line,
      position.character,
      newName
    );

    if (edit) {
      // 应用编辑
      await applyWorkspaceEdit(edit);
      vscode.window.showInformationMessage(`Renamed to ${newName}`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

/**
 * 显示补全建议
 */
async function showCompletions() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !agent) return;

  const position = editor.selection.active;

  try {
    const completions = await agent.getCompletions(
      editor.document.fileName,
      position.line,
      position.character
    );

    const items = completions.map(c => ({
      label: typeof c.label === 'string' ? c.label : c.label.label,
      detail: c.detail,
      documentation: typeof c.documentation === 'string' 
        ? c.documentation 
        : c.documentation?.value
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select completion'
    });

    if (selected) {
      await editor.edit(editBuilder => {
        editBuilder.insert(position, selected.label);
      });
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

/**
 * 提供类型悬停信息
 */
async function provideTypeHover(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | undefined> {
  if (!agent) return;

  try {
    const typeInfo = await agent.getTypeAtPosition(
      document.fileName,
      position.line,
      position.character
    );

    if (typeInfo) {
      const content = new vscode.MarkdownString();
      content.appendCodeblock(typeInfo.type, 'typescript');
      if (typeInfo.documentation) {
        content.appendMarkdown(typeInfo.documentation);
      }
      return new vscode.Hover(content);
    }
  } catch (error) {
    console.error('Hover error:', error);
  }
}

/**
 * 提供代码操作
 */
async function provideCodeActions(
  document: vscode.TextDocument,
  range: vscode.Range,
  context: vscode.CodeActionContext
): Promise<vscode.CodeAction[]> {
  if (!agent) return [];

  try {
    const fixes = await agent.getFixes(
      document.fileName,
      range.start.line,
      range.start.character
    );

    return fixes.map(fix => {
      const action = new vscode.CodeAction(
        fix.title,
        vscode.CodeActionKind.QuickFix
      );
      // 这里需要将 LSP 的 edit 转换为 VSCode 的 WorkspaceEdit
      return action;
    });
  } catch (error) {
    console.error('Code action error:', error);
    return [];
  }
}

/**
 * 文档打开处理
 */
async function onDocumentOpen(document: vscode.TextDocument) {
  if (!agent || document.languageId !== 'typescript') return;
  
  await agent.openDocument(document.fileName, document.getText());
}

/**
 * 文档变更处理
 */
async function onDocumentChange(event: vscode.TextDocumentChangeEvent) {
  if (!agent || event.document.languageId !== 'typescript') return;
  
  await agent.updateDocument(event.document.fileName, event.document.getText());
}

/**
 * 文档关闭处理
 */
async function onDocumentClose(document: vscode.TextDocument) {
  if (!agent || document.languageId !== 'typescript') return;
  
  await agent.closeDocument(document.fileName);
}

/**
 * 应用工作区编辑
 */
async function applyWorkspaceEdit(edit: any): Promise<void> {
  // 将 LSP WorkspaceEdit 转换为 VSCode WorkspaceEdit
  const vscodeEdit = new vscode.WorkspaceEdit();
  
  if (edit.changes) {
    for (const [uri, changes] of Object.entries(edit.changes)) {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(uri)
      );
      for (const change of changes as any[]) {
        vscodeEdit.replace(
          document.uri,
          new vscode.Range(
            change.range.start.line,
            change.range.start.character,
            change.range.end.line,
            change.range.end.character
          ),
          change.newText
        );
      }
    }
  }
  
  await vscode.workspace.applyEdit(vscodeEdit);
}
