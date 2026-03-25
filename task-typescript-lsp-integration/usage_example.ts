/**
 * TypeScript Agent LSP 集成使用示例
 */

import { TypeScriptAgent, TypeScriptAgentConfig } from 'typescript-agent-lsp';
import * as fs from 'fs';
import * as path from 'path';

// ==================== 示例 1: 基本使用 ====================

async function basicExample() {
  console.log('=== 示例 1: 基本使用 ===\n');

  // 配置 TypeScript Agent
  const config: TypeScriptAgentConfig = {
    lsp: {
      // TypeScript Language Server 路径
      serverPath: 'typescript-language-server',
      // 服务器参数
      serverArgs: ['--stdio'],
      // 项目根目录
      rootPath: process.cwd(),
      // 日志回调
      onLog: (message, level) => {
        console.log(`[${level}] ${message}`);
      }
    },
    features: {
      typeInference: true,    // 启用类型推断
      errorDetection: true,   // 启用错误检测
      codeCompletion: true,   // 启用代码补全
      refactoring: true,      // 启用重构
      autoFix: true          // 启用自动修复
    },
    editor: 'generic'
  };

  // 创建 Agent 实例
  const agent = new TypeScriptAgent(config);

  // 监听事件
  agent.on('ready', () => {
    console.log('Agent 已就绪');
  });

  agent.on('error', (error) => {
    console.error('Agent 错误:', error);
  });

  // 启动 Agent
  await agent.start();

  return agent;
}

// ==================== 示例 2: 类型推断 ====================

async function typeInferenceExample(agent: TypeScriptAgent) {
  console.log('\n=== 示例 2: 类型推断 ===\n');

  // 示例 TypeScript 代码
  const sampleCode = `
interface User {
  name: string;
  age: number;
  email: string;
}

function getUserInfo(user: User) {
  return \`\${user.name} is \${user.age} years old\`;
}

const user: User = {
  name: "John",
  age: 30,
  email: "john@example.com"
};

const info = getUserInfo(user);
`;

  // 写入临时文件
  const tempFile = path.join(process.cwd(), 'temp_example.ts');
  fs.writeFileSync(tempFile, sampleCode);

  // 打开文档
  await agent.openDocument(tempFile, sampleCode);

  // 获取类型信息
  // 获取 user 变量的类型
  const userType = await agent.getTypeAtPosition(tempFile, 12, 6);
  console.log('user 变量类型:', userType);

  // 获取 getUserInfo 函数的返回类型
  const functionType = await agent.getTypeAtPosition(tempFile, 6, 9);
  console.log('getUserInfo 函数类型:', functionType);

  // 获取 info 变量的类型
  const infoType = await agent.getTypeAtPosition(tempFile, 17, 6);
  console.log('info 变量类型:', infoType);

  // 清理
  await agent.closeDocument(tempFile);
  fs.unlinkSync(tempFile);
}

// ==================== 示例 3: 错误检测 ====================

async function errorDetectionExample(agent: TypeScriptAgent) {
  console.log('\n=== 示例 3: 错误检测 ===\n');

  // 包含错误的代码
  const codeWithErrors = `
function add(a: number, b: number): number {
  return a + b;
}

// 错误 1: 类型不匹配
const result = add("5", 10);

// 错误 2: 缺少参数
const result2 = add(5);

// 错误 3: 未定义变量
console.log(undefinedVariable);

// 错误 4: 隐式 any 类型
function processData(data) {
  return data.value;
}
`;

  const tempFile = path.join(process.cwd(), 'temp_errors.ts');
  fs.writeFileSync(tempFile, codeWithErrors);

  await agent.openDocument(tempFile, codeWithErrors);

  // 获取错误列表
  const errors = await agent.getErrors(tempFile);
  
  console.log(`发现 ${errors.length} 个错误:\n`);
  
  for (const error of errors) {
    console.log(`[${error.severity.toUpperCase()}] 第 ${error.range.start.line + 1} 行:`);
    console.log(`  消息: ${error.message}`);
    console.log(`  代码: ${error.code}`);
    
    if (error.fixes && error.fixes.length > 0) {
      console.log(`  可用修复: ${error.fixes.length} 个`);
    }
    console.log('');
  }

  // 清理
  await agent.closeDocument(tempFile);
  fs.unlinkSync(tempFile);
}

// ==================== 示例 4: 代码补全 ====================

async function codeCompletionExample(agent: TypeScriptAgent) {
  console.log('\n=== 示例 4: 代码补全 ===\n');

  const code = `
interface Config {
  host: string;
  port: number;
  timeout: number;
}

const config: Config = {
  host: "localhost",
  port: 3000
};

// 在这里请求补全: config.
`;

  const tempFile = path.join(process.cwd(), 'temp_completion.ts');
  fs.writeFileSync(tempFile, code);

  await agent.openDocument(tempFile, code);

  // 在 config. 后获取补全
  const completions = await agent.getCompletions(tempFile, 10, 8);
  
  console.log(`找到 ${completions.length} 个补全建议:\n`);
  
  for (const completion of completions.slice(0, 10)) {
    const label = typeof completion.label === 'string' 
      ? completion.label 
      : completion.label.label;
    console.log(`  - ${label}${completion.detail ? ` : ${completion.detail}` : ''}`);
  }

  // 清理
  await agent.closeDocument(tempFile);
  fs.unlinkSync(tempFile);
}

// ==================== 示例 5: 自动修复 ====================

async function autoFixExample(agent: TypeScriptAgent) {
  console.log('\n=== 示例 5: 自动修复 ===\n');

  const codeWithFixableErrors = `
// 隐式 any 类型 - 可自动修复
function process(data) {
  return data.toString();
}

// 另一个隐式 any
function transform(input) {
  return input * 2;
}
`;

  const tempFile = path.join(process.cwd(), 'temp_fix.ts');
  fs.writeFileSync(tempFile, codeWithFixableErrors);

  await agent.openDocument(tempFile, codeWithFixableErrors);

  // 获取错误
  const errors = await agent.getErrors(tempFile);
  console.log(`修复前: ${errors.length} 个错误`);

  // 修复所有可自动修复的错误
  const result = await agent.fixAll(tempFile);
  console.log(`修复结果: ${result.applied} 个成功, ${result.failed} 个失败`);

  // 再次检查
  const errorsAfter = await agent.getErrors(tempFile);
  console.log(`修复后: ${errorsAfter.length} 个错误`);

  // 清理
  await agent.closeDocument(tempFile);
  fs.unlinkSync(tempFile);
}

// ==================== 示例 6: 重构 ====================

async function refactoringExample(agent: TypeScriptAgent) {
  console.log('\n=== 示例 6: 重构 - 重命名符号 ===\n');

  const code = `
function calculateTotal(price: number, quantity: number): number {
  return price * quantity;
}

const total = calculateTotal(100, 5);
console.log(total);
`;

  const tempFile = path.join(process.cwd(), 'temp_refactor.ts');
  fs.writeFileSync(tempFile, code);

  await agent.openDocument(tempFile, code);

  // 重命名函数
  console.log('重命名 calculateTotal 为 computeTotal...');
  const edit = await agent.renameSymbol(tempFile, 1, 9, 'computeTotal');
  
  if (edit) {
    console.log('重命名编辑:', JSON.stringify(edit, null, 2));
  }

  // 清理
  await agent.closeDocument(tempFile);
  fs.unlinkSync(tempFile);
}

// ==================== 示例 7: 跳转到定义 ====================

async function gotoDefinitionExample(agent: TypeScriptAgent) {
  console.log('\n=== 示例 7: 跳转到定义 ===\n');

  const code = `
import { readFile } from 'fs';

function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

const message = greet('World');
`;

  const tempFile = path.join(process.cwd(), 'temp_goto.ts');
  fs.writeFileSync(tempFile, code);

  await agent.openDocument(tempFile, code);

  // 跳转到 greet 函数定义
  const locations = await agent.gotoDefinition(tempFile, 6, 16);
  
  if (locations) {
    console.log('定义位置:');
    for (const loc of locations) {
      console.log(`  文件: ${loc.uri}`);
      console.log(`  行: ${loc.range.start.line + 1}, 列: ${loc.range.start.character}`);
    }
  }

  // 清理
  await agent.closeDocument(tempFile);
  fs.unlinkSync(tempFile);
}

// ==================== 主函数 ====================

async function main() {
  try {
    // 基本示例
    const agent = await basicExample();

    // 运行其他示例
    await typeInferenceExample(agent);
    await errorDetectionExample(agent);
    await codeCompletionExample(agent);
    await autoFixExample(agent);
    await refactoringExample(agent);
    await gotoDefinitionExample(agent);

    // 停止 Agent
    console.log('\n=== 清理 ===');
    await agent.stop();
    console.log('Agent 已停止');

  } catch (error) {
    console.error('示例运行失败:', error);
    process.exit(1);
  }
}

// 运行示例
if (require.main === module) {
  main();
}

export {
  basicExample,
  typeInferenceExample,
  errorDetectionExample,
  codeCompletionExample,
  autoFixExample,
  refactoringExample,
  gotoDefinitionExample
};
