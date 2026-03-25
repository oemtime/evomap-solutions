# Agent Configuration Schema Validation & IDE Integration

完整解决方案，为AI Agent配置文件提供JSON Schema定义、验证工具和IDE集成支持。

## 目录结构

```
task-config-schema-validation/
├── agent-config.schema.json      # JSON Schema定义
├── agent-config.example.yaml     # 示例配置文件
├── validator.js                  # 命令行验证工具
├── package.json                  # Node.js包配置
├── schema-catalog-entry.json     # Schema目录条目
├── README.md                     # 本文档
├── USAGE.md                      # 详细使用指南
├── vscode-extension/             # VSCode插件
│   ├── package.json
│   ├── extension.js
│   ├── language-configuration.json
│   └── snippets/
│       └── agent-snippets.json
└── intellij-plugin/              # IntelliJ IDEA插件
    └── src/main/resources/META-INF/
        └── plugin.xml
```

## 功能特性

### 1. Schema定义 (`agent-config.schema.json`)

- ✅ 完整的JSON Schema定义 (Draft-07)
- ✅ 支持多种Agent框架 (LangChain, LangGraph, AutoGen, CrewAI, EvoMap等)
- ✅ 模型配置 (OpenAI, Anthropic, Google, Azure, Ollama等)
- ✅ 工具配置与权限控制
- ✅ 内存管理配置 (Buffer, Window, Vector, Graph)
- ✅ 工作流定义 (多步骤流程)
- ✅ 多Agent系统配置
- ✅ 安全与沙箱配置
- ✅ 可观测性配置 (日志、追踪、指标)
- ✅ 部署配置

### 2. 验证工具 (`validator.js`)

```bash
# 安装依赖
npm install

# 验证配置文件
node validator.js agent.yaml

# 严格模式验证
node validator.js agent.yaml --strict

# JSON格式输出
node validator.js agent.yaml --format json

# 紧凑格式输出
node validator.js agent.yaml --format compact
```

#### 退出码
- `0` - 配置有效
- `1` - 验证错误
- `2` - 文件/解析错误

### 3. VSCode集成

#### 安装方式

1. **本地安装**
   ```bash
   cd vscode-extension
   npm install
   code .
   # 在VSCode中按F5启动扩展宿主
   ```

2. **手动安装**
   - 复制 `vscode-extension` 到 `~/.vscode/extensions/evomap.agent-config-1.0.0/`

3. **Schema关联** (无需安装插件)
   在 `settings.json` 中添加：
   ```json
   {
     "yaml.schemas": {
       "./agent-config.schema.json": "*.agent.yaml"
     },
     "json.schemas": [
       {
         "fileMatch": ["*.agent.json"],
         "url": "./agent-config.schema.json"
       }
     ]
   }
   ```

#### 功能特性

- ✅ YAML/JSON Schema验证
- ✅ 智能自动补全 (IntelliSense)
- ✅ 悬停提示与文档
- ✅ 代码片段 (Snippets)
- ✅ 保存时自动验证
- ✅ 命令面板集成 (`Ctrl+Shift+P` → "Validate Agent Config")

#### 代码片段

| 前缀 | 描述 |
|------|------|
| `agent` | 完整Agent配置 |
| `model` | 模型配置块 |
| `tool` | 工具配置 |
| `memory` | 内存配置 |
| `workflow-step` | 工作流步骤 |
| `subagent` | 子Agent定义 |
| `security` | 安全配置 |
| `observability` | 可观测性配置 |

### 4. IntelliJ IDEA集成

#### 安装方式

1. 打开 Settings → Plugins → Marketplace
2. 搜索 "EvoMap Agent Config" (如果已发布)
3. 或使用本地安装:
   - Build插件: `./gradlew buildPlugin`
   - 安装: Settings → Plugins → Install from disk → 选择 `.zip`

#### Schema关联 (无需插件)

1. Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings
2. 添加新映射:
   - Schema file: `agent-config.schema.json`
   - File path pattern: `*.agent.yaml`

## 支持的配置格式

### 文件命名约定

| 文件名 | 格式 | 优先级 |
|--------|------|--------|
| `*.agent.yaml` | YAML | 高 |
| `*.agent.yml` | YAML | 高 |
| `*.agent.json` | JSON | 高 |
| `agent.config.yaml` | YAML | 中 |
| `agent.config.json` | JSON | 中 |
| `.agentrc` | YAML/JSON | 低 |
| `.agentrc.yaml` | YAML | 低 |

### 示例配置

```yaml
name: "my-agent"
version: "1.0.0"
description: "AI Agent配置示例"
type: "chat"
framework: "evomap"

models:
  provider: "openai"
  model: "gpt-4"
  temperature: 0.7
  maxTokens: 2048

prompts:
  system: "You are a helpful AI assistant."

tools:
  - name: "search"
    description: "搜索工具"
    enabled: true
    timeout: 30

memory:
  type: "buffer"
  maxTokens: 4000

execution:
  mode: "sync"
  timeout: 300
  retry:
    maxAttempts: 3
    backoff: "exponential"

security:
  sandbox: true
  rateLimit:
    requestsPerMinute: 60

observability:
  logging:
    level: "info"
  tracing:
    enabled: true
    provider: "otel"
```

## 快速开始

### 1. 验证现有配置

```bash
node validator.js your-agent.yaml
```

### 2. 创建新配置

使用示例文件作为模板：

```bash
cp agent-config.example.yaml my-agent.yaml
# 编辑 my-agent.yaml
```

### 3. IDE配置

**VSCode:**
```json
// settings.json
{
  "yaml.schemas": {
    "./agent-config.schema.json": "*.agent.yaml"
  }
}
```

**IntelliJ:**
```
Settings → Languages & Frameworks → JSON Schema Mappings
Add: Schema file + File path pattern
```

## 验证功能

### Schema验证规则

- **必需字段**: `name`, `version`
- **类型检查**: 所有字段类型严格验证
- **枚举值**: framework, type, provider等字段使用枚举
- **数值范围**: temperature [0, 2], maxTokens >= 1等
- **模式匹配**: version字段遵循SemVer规范
- **嵌套验证**: 嵌套对象完整验证

### 严格模式额外检查

- 缺少description警告
- 缺少security配置警告
- temperature超出推荐范围警告
- 工具缺少timeout配置警告

## 贡献

1. Fork本仓库
2. 创建功能分支
3. 提交更改
4. 创建Pull Request

## 许可证

MIT License

## 相关链接

- [JSON Schema](https://json-schema.org/)
- [YAML Specification](https://yaml.org/spec/)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [IntelliJ Platform SDK](https://plugins.jetbrains.com/docs/intellij/)
