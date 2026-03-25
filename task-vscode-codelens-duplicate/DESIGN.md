# VS Code CodeLens 防重复代码扩展 - 设计文档

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Extension  │  │   Commands   │  │    Agent     │      │
│  │    Entry     │  │   Handler    │  │     API      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           │                                 │
│  ┌────────────────────────┼────────────────────────┐       │
│  │           CodeLens Provider                      │       │
│  │  ┌────────────────────┼────────────────────┐    │       │
│  │  │         Duplicate Detection Pipeline       │    │       │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  │    │       │
│  │  │  │  Code   │→ │  Block  │→ │Similarity│  │    │       │
│  │  │  │ Parser  │  │Extractor│  │ Analysis │  │    │       │
│  │  │  └─────────┘  └─────────┘  └─────────┘  │    │       │
│  │  │                    ↓                      │    │       │
│  │  │              ┌─────────┐                │    │       │
│  │  │              │Clustering│                │    │       │
│  │  │              └─────────┘                │    │       │
│  │  └─────────────────────────────────────────┘    │       │
│  │                           ↓                     │       │
│  │              ┌─────────────────────┐           │       │
│  │              │ Refactoring Suggester│           │       │
│  │              └─────────────────────┘           │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件说明

| 组件 | 职责 | 文件 |
|------|------|------|
| Extension Entry | 扩展入口，初始化配置和提供者 | `extension.ts` |
| CodeLens Provider | 提供 CodeLens 提示 | `duplicateCodeLensProvider.ts` |
| Code Parser | 代码解析和分块 | `codeParser.ts` |
| Similarity Detector | 相似度检测算法 | `similarityDetector.ts` |
| AST Analyzer | AST 分析器 | `astAnalyzer.ts` |
| Suggestion Provider | 重构建议生成 | `suggestionProvider.ts` |

## 2. 检测算法设计

### 2.1 多维度相似度检测

```
┌─────────────────────────────────────────────────────────┐
│                  Similarity Detection                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Text      │  │    AST      │  │   Token     │     │
│  │ Similarity  │  │ Similarity  │  │ Similarity  │     │
│  │   (40%)     │  │   (30%)     │  │   (30%)     │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          ↓                              │
│              ┌─────────────────────┐                   │
│              │   Combined Score    │                   │
│              │  (Weighted Average) │                   │
│              └─────────────────────┘                   │
│                          ↓                              │
│              ┌─────────────────────┐                   │
│              │   Threshold Filter  │                   │
│              │    (default: 0.8)   │                   │
│              └─────────────────────┘                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 文本相似度算法

使用 **Levenshtein 距离** 计算字符串相似度：

```typescript
similarity = 1 - (levenshteinDistance / maxLength)
```

**预处理步骤：**
1. 移除注释
2. 标准化空白字符
3. 规范化标识符（变量名替换为占位符）

### 2.3 AST 相似度算法

```
AST Similarity = MatchingNodes / TotalNodes
```

**比较策略：**
- 节点类型匹配：权重 0.6
- 子节点结构匹配：权重 0.4

### 2.4 Token 相似度算法

使用 **余弦相似度** 计算 token 频率向量的相似性：

```
cosine(A, B) = (A · B) / (||A|| × ||B||)
```

## 3. 代码分块策略

### 3.1 分块层次

```
Level 1: 函数/方法级别
  ├── function declarations
  ├── method definitions
  └── arrow functions

Level 2: 类/结构级别
  ├── class declarations
  ├── interface definitions
  └── struct declarations

Level 3: 逻辑块级别
  ├── if/else blocks
  ├── for/while loops
  └── switch cases

Level 4: 滑动窗口
  └── 5-line sliding windows
```

### 3.2 分块示例

```javascript
// 原始代码
function calculateTotal(items) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}

function calculateSubtotal(products) {
  let subtotal = 0;
  for (const product of products) {
    subtotal += product.price * product.count;
  }
  return subtotal;
}

// 分块结果
Block 1: calculateTotal function (lines 1-7)
Block 2: calculateSubtotal function (lines 9-15)
```

## 4. CodeLens 交互设计

### 4.1 CodeLens 显示规则

```
┌─────────────────────────────────────────────────────────┐
│  1  │ function processData(data) {                      │
│     │ ⚠️ 发现 3 处重复代码 (85% 相似)                    │
│     │ 🔧 提取函数 extractedFunction                     │
│     │ → 查看其他 2 处重复                               │
├─────┼───────────────────────────────────────────────────┤
│  2  │   const result = [];                              │
│  3  │   for (const item of data) {                      │
│  4  │     result.push(transform(item));                 │
│  5  │   }                                               │
│  6  │   return result;                                  │
│  7  │ }                                                 │
└─────┴───────────────────────────────────────────────────┘
```

### 4.2 交互命令

| 命令 | 功能 | 快捷键 |
|------|------|--------|
| 点击 "发现 X 处重复" | 显示重复详情面板 | - |
| 点击 "提取函数" | 应用重构建议 | - |
| 点击 "查看其他重复" | 跳转到其他重复位置 | - |
| Scan Current File | 扫描当前文件 | - |
| Scan Workspace | 扫描整个工作区 | - |
| Show Report | 显示重复代码报告 | - |

## 5. Agent 集成设计

### 5.1 API 接口

```typescript
interface AgentAPI {
  // 检查代码是否包含重复
  checkCode(code: string, language: string): Promise<DuplicateCheckResult>;
  
  // 获取重构建议
  getSuggestions(code: string, language: string): Promise<RefactoringSuggestion[]>;
  
  // 自动修复重复代码
  autoFix(code: string, language: string): Promise<string>;
}
```

### 5.2 Agent 工作流集成

```
┌─────────────────────────────────────────────────────────┐
│                  Agent Code Generation                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Agent 生成代码                                        │
│            ↓                                             │
│  2. 调用 checkCode() 检查重复                             │
│            ↓                                             │
│  3. 有重复？ ──Yes──→ 4. 获取上下文和建议                  │
│     ↓ No                      ↓                          │
│  5. 返回代码          5. 重新生成（带上下文）               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5.3 上下文提供

当检测到重复时，向 Agent 提供：

```typescript
{
  hasDuplicates: true,
  duplicates: [...],
  context: {
    existingFunctions: ['calculateTotal', 'calculateSubtotal'],
    similarPatterns: ['Array iteration with accumulation'],
    recommendedExtracts: ['extract accumulation logic']
  }
}
```

## 6. 配置选项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| enable | boolean | true | 启用/禁用检测 |
| similarityThreshold | number | 0.8 | 相似度阈值 (0.0-1.0) |
| minLines | number | 3 | 最小检测行数 |
| scanOnSave | boolean | true | 保存时扫描 |
| scanOnType | boolean | false | 输入时扫描 |
| languages | string[] | [...] | 启用的语言 |
| ignorePatterns | string[] | [...] | 忽略的文件模式 |
| showCodeLens | boolean | true | 显示 CodeLens |
| maxDuplicatesToShow | number | 5 | 最多显示重复数 |

## 7. 性能优化

### 7.1 缓存策略

```
┌─────────────────────────────────────────────────────────┐
│                    Caching Layer                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  File Content Hash ──→ Cache Key                        │
│         ↓                                               │
│  ┌─────────────────────────────────────┐               │
│  │  Cache Entry                        │               │
│  │  ├── result: DuplicateGroup[]       │               │
│  │  ├── timestamp: number              │               │
│  │  └── contentHash: string            │               │
│  └─────────────────────────────────────┘               │
│         ↓                                               │
│  TTL: 30 seconds                                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7.2 增量扫描

- 仅扫描变更的文件
- 复用未变更文件的缓存结果
- 后台异步处理大文件

## 8. 支持的编程语言

| 语言 | 扩展名 | 支持程度 |
|------|--------|----------|
| JavaScript | .js, .jsx | ✅ 完整支持 |
| TypeScript | .ts, .tsx | ✅ 完整支持 |
| Python | .py | ✅ 完整支持 |
| Java | .java | ✅ 完整支持 |
| Go | .go | ✅ 完整支持 |
| Rust | .rs | ✅ 完整支持 |
| C/C++ | .c, .cpp | ⚠️ 基础支持 |
| C# | .cs | ⚠️ 基础支持 |

## 9. 未来扩展

### 9.1 计划功能

1. **语义相似度**：使用代码嵌入模型
2. **跨文件重构**：自动提取到共享模块
3. **机器学习**：基于历史重构学习最佳建议
4. **团队协作**：共享团队代码模式库

### 9.2 集成扩展

1. **Git 集成**：检测提交中引入的重复
2. **CI/CD 集成**：在流水线中检查重复
3. **代码审查**：PR 中标记重复代码
