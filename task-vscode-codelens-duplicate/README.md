# VS Code CodeLens 防重复代码扩展

## 项目概述

这是一个 VS Code 扩展，通过 CodeLens 技术实时检测代码中的重复代码，并提供智能重构建议。该扩展与 Agent 代码生成流程集成，帮助防止在 AI 辅助编程中引入重复代码。

## 功能特性

1. **实时重复代码检测** - 使用 CodeLens 在编辑器中显示重复代码警告
2. **代码相似度算法** - 基于 AST 和文本相似度的混合检测算法
3. **智能重构建议** - 提供提取函数、创建工具类等重构方案
4. **Agent 集成** - 与 AI Agent 代码生成流程无缝集成

## 安装指南

### 本地安装

1. 克隆或下载本项目
2. 进入项目目录：`cd duplicate-code-detector`
3. 安装依赖：`npm install`
4. 编译项目：`npm run compile`
5. 按 F5 启动调试，或打包安装：`vsce package`

### 从 VSIX 安装

1. 下载 `.vsix` 文件
2. 在 VS Code 中打开扩展面板（Cmd+Shift+X）
3. 点击右上角 `...` → `从 VSIX 安装`
4. 选择下载的 `.vsix` 文件

## 使用方法

### 基本使用

1. 打开任意代码文件
2. 重复代码上方会显示 CodeLens 提示：
   - `⚠️ 发现 2 处重复代码` - 点击可查看详情
   - `🔧 提取函数` - 快速重构建议

### 配置选项

在 `settings.json` 中添加：

```json
{
  "duplicateCodeDetector.enable": true,
  "duplicateCodeDetector.similarityThreshold": 0.8,
  "duplicateCodeDetector.minLines": 3,
  "duplicateCodeDetector.scanOnSave": true,
  "duplicateCodeDetector.languages": ["javascript", "typescript", "python"]
}
```

### 命令面板

- `Duplicate Code: Scan Current File` - 扫描当前文件
- `Duplicate Code: Scan Workspace` - 扫描整个工作区
- `Duplicate Code: Show Report` - 显示重复代码报告
- `Duplicate Code: Extract Function` - 提取选中代码为函数

## 架构设计

### 核心组件

```
src/
├── extension.ts          # 扩展入口
├── providers/
│   └── duplicateCodeLensProvider.ts  # CodeLens 提供者
├── detectors/
│   ├── similarityDetector.ts         # 相似度检测算法
│   └── astAnalyzer.ts                # AST 分析器
├── refactor/
│   └── suggestionProvider.ts         # 重构建议
├── utils/
│   ├── codeParser.ts                 # 代码解析工具
│   └── similarityCalculator.ts       # 相似度计算
└── types/
    └── index.ts                      # 类型定义
```

### 检测算法

1. **预处理阶段**
   - 代码分块（按函数/类/逻辑块）
   - 标准化处理（去除注释、空白、变量名）

2. **相似度计算**
   - 文本相似度：基于 Levenshtein 距离
   - AST 相似度：基于树编辑距离
   - 语义相似度：基于 token 序列

3. **结果合并**
   - 加权融合多种相似度
   - 阈值过滤
   - 聚类分组

## Agent 集成

### 与 AI Agent 协作

扩展提供 API 供 Agent 调用：

```typescript
// 检查代码是否包含重复
const hasDuplicates = await duplicateCodeDetector.checkCode(code);

// 获取重构建议
const suggestions = await duplicateCodeDetector.getRefactoringSuggestions(code);

// 自动修复重复代码
const fixedCode = await duplicateCodeDetector.autoFix(code);
```

### 在 Agent 工作流中使用

```typescript
// Agent 生成代码前检查
async function generateCode(prompt: string): Promise<string> {
  const generatedCode = await ai.generate(prompt);
  
  // 检查重复
  const checkResult = await duplicateCodeDetector.analyze(generatedCode);
  
  if (checkResult.hasDuplicates) {
    // 提供上下文给 Agent 重新生成
    const context = checkResult.getContext();
    return await ai.generateWithContext(prompt, context);
  }
  
  return generatedCode;
}
```

## 开发指南

### 项目结构

```
duplicate-code-detector/
├── .vscode/              # VS Code 配置
├── src/                  # 源代码
├── out/                  # 编译输出
├── test/                 # 测试文件
├── package.json          # 扩展配置
└── tsconfig.json         # TypeScript 配置
```

### 调试

1. 按 F5 启动调试
2. 在 `[Extension Development Host]` 窗口中测试
3. 使用 `console.log` 输出调试信息到调试控制台

### 测试

```bash
# 运行单元测试
npm test

# 运行集成测试
npm run test:integration
```

## 许可证

MIT
