# TypeScript Agent LSP 集成架构设计文档

## 1. 设计目标

### 1.1 主要目标
- 提供实时的类型推断和错误检测
- 支持智能代码补全和修复建议
- 兼容主流编辑器（VSCode、Vim、Neovim）
- 高性能、低延迟的 LSP 通信

### 1.2 设计原则
- **模块化**: 各功能独立，便于扩展
- **可配置**: 支持多种配置选项
- **兼容性**: 遵循 LSP 3.17 规范
- **性能优先**: 最小化通信开销

## 2. 系统架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│         (VSCode Extension / Vim Plugin / Neovim Plugin)     │
├─────────────────────────────────────────────────────────────┤
│                      Application Layer                       │
│              (TypeScript Agent - 核心逻辑层)                 │
├─────────────────────────────────────────────────────────────┤
│                      Protocol Layer                          │
│                   (LSP Client - JSON-RPC)                   │
├─────────────────────────────────────────────────────────────┤
│                      Service Layer                           │
│           (TypeScript Language Server - tsserver)           │
├─────────────────────────────────────────────────────────────┤
│                      Data Layer                              │
│              (TypeScript Compiler API)                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 组件详细设计

#### 2.2.1 LSP Client

```typescript
interface LSPClientConfig {
  // 服务器路径
  serverPath: string;
  // 根目录
  rootPath: string;
  // 初始化选项
  initializationOptions?: InitializationOptions;
  // 日志级别
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

interface InitializationOptions {
  // TypeScript SDK 路径
  typescript?: {
    tsdk: string;
  };
  // 偏好设置
  preferences?: UserPreferences;
}
```

#### 2.2.2 TypeScript Agent

```typescript
interface TypeScriptAgentConfig {
  // LSP 客户端配置
  lsp: LSPClientConfig;
  // 功能开关
  features: {
    typeInference: boolean;
    errorDetection: boolean;
    codeCompletion: boolean;
    refactoring: boolean;
    autoFix: boolean;
  };
  // 编辑器特定配置
  editor: 'vscode' | 'vim' | 'neovim';
}
```

## 3. 通信协议

### 3.1 JSON-RPC 消息格式

#### 请求消息
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "textDocument/hover",
  "params": {
    "textDocument": {
      "uri": "file:///path/to/file.ts"
    },
    "position": {
      "line": 10,
      "character": 15
    }
  }
}
```

#### 响应消息
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "contents": {
      "kind": "markdown",
      "value": "```typescript\nfunction add(a: number, b: number): number\n```"
    }
  }
}
```

### 3.2 支持的 LSP 方法

| 方法 | 描述 | 用途 |
|------|------|------|
| `textDocument/hover` | 悬停信息 | 类型推断 |
| `textDocument/diagnostic` | 诊断信息 | 错误检测 |
| `textDocument/completion` | 代码补全 | 智能提示 |
| `textDocument/codeAction` | 代码操作 | 自动修复 |
| `textDocument/rename` | 重命名 | 重构 |
| `textDocument/definition` | 跳转到定义 | 导航 |
| `textDocument/references` | 查找引用 | 分析 |

## 4. 类型推断机制

### 4.1 类型推断流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   代码输入   │────▶│  语法分析   │────▶│  类型检查   │────▶│  类型推断   │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                                                                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   结果返回   │◀────│  结果格式化  │◀────│  类型分析   │◀────│  上下文分析  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 4.2 类型推断策略

1. **基于上下文的推断**: 根据变量使用位置推断类型
2. **基于赋值的推断**: 根据赋值表达式推断类型
3. **基于返回值的推断**: 根据 return 语句推断函数返回类型
4. **泛型推断**: 自动推断泛型参数类型

## 5. 错误检测机制

### 5.1 错误分类

| 类型 | 描述 | 示例 |
|------|------|------|
| 语法错误 | 代码语法问题 | 缺少分号、括号不匹配 |
| 类型错误 | 类型不匹配 | 将 string 赋值给 number |
| 未定义错误 | 使用未定义的变量 | 引用不存在的变量 |
| 导入错误 | 模块导入问题 | 找不到模块 |

### 5.2 错误修复策略

1. **自动修复**: 一键修复常见错误
2. **建议修复**: 提供多种修复方案
3. **批量修复**: 修复文件中所有同类错误

## 6. 代码补全机制

### 6.1 补全类型

1. **基于类型的补全**: 根据上下文类型提供补全
2. **基于使用的补全**: 根据代码使用频率排序
3. **Snippet 补全**: 代码片段补全
4. **路径补全**: 模块路径补全

### 6.2 补全触发条件

- 输入 `.` 触发成员补全
- 输入 `:` 触发类型补全
- 输入 `"` 或 `'` 触发字符串补全
- 输入 `@` 触发装饰器补全

## 7. 编辑器集成

### 7.1 VSCode 集成

```typescript
// VSCode 扩展激活
export function activate(context: vscode.ExtensionContext) {
  const agent = new TypeScriptAgent({
    lsp: {
      serverPath: getServerPath(),
      rootPath: vscode.workspace.rootPath || ''
    },
    editor: 'vscode'
  });

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('typescriptAgent.showType', () => {
      agent.showTypeAtPosition();
    })
  );
}
```

### 7.2 Vim/Neovim 集成

```vim
" Vim 配置示例
if exists('g:typescript_agent_loaded')
  finish
endif
let g:typescript_agent_loaded = 1

" 启动 TypeScript Agent
function! s:StartTypeScriptAgent()
  let l:config = {
    \ 'serverPath': get(g:, 'typescript_agent_server_path', 'typescript-language-server'),
    \ 'rootPath': getcwd()
  \ }
  " 初始化 Agent
  call typescript_agent#init(l:config)
endfunction

augroup TypeScriptAgent
  autocmd!
  autocmd FileType typescript,typescriptreact call s:StartTypeScriptAgent()
augroup END
```

## 8. 性能优化

### 8.1 优化策略

1. **增量同步**: 只同步变更的文档内容
2. **缓存机制**: 缓存类型信息和诊断结果
3. **延迟处理**: 防抖处理用户输入
4. **并行处理**: 异步处理非关键任务

### 8.2 性能指标

| 指标 | 目标值 |
|------|--------|
| 初始化时间 | < 2s |
| 补全响应时间 | < 100ms |
| 诊断更新延迟 | < 500ms |
| 内存占用 | < 200MB |

## 9. 错误处理

### 9.1 错误分类

1. **连接错误**: LSP 服务器连接失败
2. **超时错误**: 请求超时
3. **解析错误**: JSON-RPC 消息解析失败
4. **服务器错误**: LSP 服务器内部错误

### 9.2 恢复策略

1. **自动重连**: 连接断开时自动重连
2. **降级模式**: 服务器不可用时使用本地分析
3. **错误报告**: 向用户显示友好的错误信息

## 10. 安全考虑

1. **代码执行限制**: 不执行用户代码
2. **路径验证**: 验证所有文件路径
3. **资源限制**: 限制内存和 CPU 使用
4. **日志脱敏**: 不在日志中记录敏感信息
