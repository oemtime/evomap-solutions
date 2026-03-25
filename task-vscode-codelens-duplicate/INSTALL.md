# 安装和使用指南

## 系统要求

- VS Code 1.74.0 或更高版本
- Node.js 16.x 或更高版本（开发时）

## 安装方式

### 方式一：本地开发安装

1. 克隆或下载本项目到本地

```bash
cd /path/to/duplicate-code-detector
```

2. 安装依赖

```bash
npm install
```

3. 编译项目

```bash
npm run compile
```

4. 启动调试

- 在 VS Code 中打开项目
- 按 `F5` 启动调试
- 这会打开一个新的 VS Code 窗口（Extension Development Host）

### 方式二：打包安装

1. 安装 vsce 工具

```bash
npm install -g @vscode/vsce
```

2. 打包扩展

```bash
vsce package
```

这会生成一个 `.vsix` 文件。

3. 在 VS Code 中安装

- 打开扩展面板（Cmd+Shift+X 或 Ctrl+Shift+X）
- 点击右上角 `...` 菜单
- 选择 `从 VSIX 安装...`
- 选择生成的 `.vsix` 文件

## 使用方法

### 基本使用

1. 打开任意支持的代码文件（JavaScript、TypeScript、Python 等）
2. 保存文件（如果启用了 `scanOnSave`）
3. 重复代码上方会显示 CodeLens 提示：

```
⚠️ 发现 3 处重复代码 (85% 相似)
🔧 提取函数 extractedFunction
→ 查看其他 2 处重复
```

### 命令面板

按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）打开命令面板，输入 "Duplicate Code"：

| 命令 | 功能 |
|------|------|
| `Duplicate Code: Scan Current File` | 手动扫描当前文件 |
| `Duplicate Code: Scan Workspace` | 扫描整个工作区 |
| `Duplicate Code: Show Report` | 显示重复代码报告 |
| `Duplicate Code: Extract Function` | 提取选中的代码为函数 |

### 配置设置

打开 VS Code 设置（`Cmd+,` 或 `Ctrl+,`），搜索 "Duplicate Code Detector"，或直接在 `settings.json` 中添加：

```json
{
  "duplicateCodeDetector.enable": true,
  "duplicateCodeDetector.similarityThreshold": 0.8,
  "duplicateCodeDetector.minLines": 3,
  "duplicateCodeDetector.scanOnSave": true,
  "duplicateCodeDetector.scanOnType": false,
  "duplicateCodeDetector.languages": [
    "javascript",
    "typescript",
    "python",
    "java",
    "go",
    "rust"
  ],
  "duplicateCodeDetector.ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**"
  ],
  "duplicateCodeDetector.showCodeLens": true,
  "duplicateCodeDetector.maxDuplicatesToShow": 5
}
```

### 配置项说明

| 配置项 | 说明 |
|--------|------|
| `enable` | 启用/禁用重复代码检测 |
| `similarityThreshold` | 相似度阈值（0.0-1.0），越高要求越严格 |
| `minLines` | 最小检测行数，少于此行数的代码块将被忽略 |
| `scanOnSave` | 保存文件时自动扫描 |
| `scanOnType` | 输入时实时扫描（可能影响性能） |
| `languages` | 启用检测的编程语言列表 |
| `ignorePatterns` | 忽略的文件匹配模式 |
| `showCodeLens` | 是否在编辑器中显示 CodeLens 提示 |
| `maxDuplicatesToShow` | 每组最多显示的重复数量 |

## 使用示例

### 示例 1：检测重复函数

```javascript
// 文件: utils.js

// 这段代码会被检测到重复
function calculateTotal(items) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}

// 这段代码与上面 85% 相似
function calculateSubtotal(products) {
  let subtotal = 0;
  for (const product of products) {
    subtotal += product.price * product.count;
  }
  return subtotal;
}
```

CodeLens 会显示：
```
⚠️ 发现 2 处重复代码 (85% 相似)
🔧 提取函数 calculateSum
→ 查看其他 1 处重复
```

### 示例 2：应用重构建议

1. 点击 `🔧 提取函数 calculateSum`
2. 在弹出的确认框中查看预览
3. 点击 "Apply" 应用重构

重构后的代码：

```javascript
function calculateSum(items, priceKey, qtyKey) {
  let total = 0;
  for (const item of items) {
    total += item[priceKey] * item[qtyKey];
  }
  return total;
}

function calculateTotal(items) {
  return calculateSum(items, 'price', 'quantity');
}

function calculateSubtotal(products) {
  return calculateSum(products, 'price', 'count');
}
```

## Agent 集成

### 在代码生成前检查

```typescript
import * as vscode from 'vscode';

async function generateCode(prompt: string): Promise<string> {
  // 1. 生成代码
  const generatedCode = await ai.generate(prompt);
  
  // 2. 检查重复
  const extension = vscode.extensions.getExtension('evomap.duplicate-code-detector');
  if (extension) {
    const api = extension.exports.getAgentAPI();
    const checkResult = await api.checkCode(generatedCode, 'javascript');
    
    if (checkResult.hasDuplicates) {
      // 3. 使用上下文重新生成
      const context = checkResult.context;
      return await ai.generateWithContext(prompt, context);
    }
  }
  
  return generatedCode;
}
```

### 获取重构建议

```typescript
const api = extension.exports.getAgentAPI();
const suggestions = await api.getSuggestions(code, 'typescript');

for (const suggestion of suggestions) {
  console.log(`建议: ${suggestion.description}`);
  console.log(`置信度: ${suggestion.confidence}`);
  console.log(`预览:\n${suggestion.preview}`);
}
```

## 故障排除

### 问题：CodeLens 不显示

**解决方案：**
1. 检查 `duplicateCodeDetector.enable` 是否为 `true`
2. 检查 `duplicateCodeDetector.showCodeLens` 是否为 `true`
3. 检查文件语言是否在 `duplicateCodeDetector.languages` 列表中
4. 尝试运行命令 `Duplicate Code: Scan Current File`

### 问题：检测不准确

**解决方案：**
1. 调整 `similarityThreshold`（降低阈值会检测更多相似代码）
2. 调整 `minLines`（降低会检测更短的代码块）
3. 检查代码是否被 `ignorePatterns` 排除

### 问题：性能问题

**解决方案：**
1. 关闭 `scanOnType`，只使用 `scanOnSave`
2. 增加 `minLines` 值
3. 减少 `languages` 列表中的语言数量
4. 添加更多 `ignorePatterns` 排除大文件

## 更新日志

### v1.0.0
- 初始版本发布
- 支持 JavaScript、TypeScript、Python、Java、Go、Rust
- 实现多维度相似度检测
- 提供 CodeLens 实时提示
- 提供重构建议

## 反馈和支持

如有问题或建议，请提交 Issue 或 Pull Request。
