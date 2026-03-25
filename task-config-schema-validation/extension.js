// The module 'vscode' contains the VS Code extensibility API
const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('EvoMap Agent Config extension is now active');

    // Register validate command
    let validateCommand = vscode.commands.registerCommand('evomap.validateConfig', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const filePath = document.uri.fsPath;
        const config = vscode.workspace.getConfiguration('evomap');
        
        // Build command
        let cmd = `node "${path.join(__dirname, '..', 'validator.js')}" "${filePath}"`;
        
        if (config.get('strictValidation')) {
            cmd += ' --strict';
        }
        
        const customSchema = config.get('customSchemaPath');
        if (customSchema) {
            cmd += ` --schema "${customSchema}"`;
        }

        // Execute validation
        exec(cmd, (error, stdout, stderr) => {
            if (stderr) {
                vscode.window.showErrorMessage(`Validation error: ${stderr}`);
                return;
            }

            const channel = vscode.window.createOutputChannel('Agent Config Validation');
            channel.clear();
            channel.append(stdout);
            channel.show();

            if (error) {
                vscode.window.showWarningMessage('Configuration has validation errors');
            } else {
                vscode.window.showInformationMessage('✓ Configuration is valid!');
            }
        });
    });

    // Register generate config command
    let generateCommand = vscode.commands.registerCommand('evomap.generateConfig', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const template = `name: "new-agent"
version: "1.0.0"
description: "New agent configuration"
type: "chat"
framework: "evomap"

models:
  provider: "openai"
  model: "gpt-4"
  temperature: 0.7

prompts:
  system: "You are a helpful AI assistant."

execution:
  mode: "sync"
  timeout: 300
`;

        const position = new vscode.Position(0, 0);
        editor.edit(editBuilder => {
            editBuilder.insert(position, template);
        });
    });

    // Register on-save validation
    let saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
        const config = vscode.workspace.getConfiguration('evomap');
        if (!config.get('validateOnSave')) {
            return;
        }

        const fileName = document.fileName;
        if (fileName.match(/\.(agent\.(yaml|yml|json)|config\.(yaml|yml|json))$/)) {
            vscode.commands.executeCommand('evomap.validateConfig');
        }
    });

    context.subscriptions.push(validateCommand);
    context.subscriptions.push(generateCommand);
    context.subscriptions.push(saveDisposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
