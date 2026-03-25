# Agent Config Schema - 使用文档

## 目录

1. [配置文件结构](#配置文件结构)
2. [字段详解](#字段详解)
3. [配置示例](#配置示例)
4. [IDE集成指南](#ide集成指南)
5. [故障排除](#故障排除)

---

## 配置文件结构

### 顶级字段

```yaml
name: string           # 必需 - Agent名称
version: string        # 必需 - 版本号 (SemVer)
description: string    # 可选 - 描述
type: string           # 可选 - Agent类型
framework: string      # 可选 - 框架
models: ModelConfig    # 可选 - 模型配置
prompts: Prompts       # 可选 - 提示模板
tools: ToolConfig[]    # 可选 - 工具列表
memory: MemoryConfig   # 可选 - 内存配置
workflow: Workflow     # 可选 - 工作流
agents: Agent[]        # 可选 - 子Agent
execution: Execution   # 可选 - 执行设置
security: Security     # 可选 - 安全配置
observability: Observability  # 可选 - 可观测性
deployment: Deployment  # 可选 - 部署配置
extensions: object     # 可选 - 扩展字段
```

---

## 字段详解

### Agent类型 (`type`)

| 值 | 说明 |
|----|------|
| `chat` | 对话型Agent (默认) |
| `task` | 任务型Agent |
| `workflow` | 工作流型Agent |
| `autonomous` | 自主型Agent |
| `multi-agent` | 多Agent系统 |
| `tool-calling` | 工具调用型 |
| `custom` | 自定义类型 |

### 框架 (`framework`)

| 值 | 说明 |
|----|------|
| `evomap` | EvoMap框架 |
| `langchain` | LangChain |
| `langgraph` | LangGraph |
| `autogen` | AutoGen |
| `crewai` | CrewAI |
| `dspy` | DSPy |
| `openai-assistants` | OpenAI Assistants |
| `llamaindex` | LlamaIndex |
| `semantic-kernel` | Semantic Kernel |
| `custom` | 自定义框架 |

### 模型配置 (`models`)

单模型或多模型配置：

```yaml
# 单模型
models:
  provider: "openai"
  model: "gpt-4"
  temperature: 0.7
  maxTokens: 2048

# 多模型
models:
  - provider: "openai"
    model: "gpt-4"
    role: "default"
  - provider: "anthropic"
    model: "claude-3-sonnet-20240229"
    role: "fast"
```

#### 模型提供商 (`provider`)

- `openai` - OpenAI
- `anthropic` - Anthropic
- `google` - Google (Gemini)
- `azure` - Azure OpenAI
- `deepseek` - DeepSeek
- `mistral` - Mistral AI
- `ollama` - Ollama (本地)
- `custom` - 自定义

#### 模型参数

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `temperature` | number | 0-2 | 0.7 | 随机性 |
| `maxTokens` | integer | ≥1 | - | 最大token数 |
| `topP` | number | 0-1 | - | 核采样 |
| `timeout` | integer | ≥1000 | 30000 | 超时(ms) |

### 工具配置 (`tools`)

```yaml
tools:
  - name: "search"
    description: "Web搜索"
    enabled: true
    timeout: 30
    config:
      engine: "google"
      apiKey: "${SEARCH_API_KEY}"
```

### 内存配置 (`memory`)

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| `buffer` | 缓冲区内存 | 简单对话 |
| `window` | 滑动窗口 | 长对话 |
| `vector` | 向量存储 | 语义搜索 |
| `graph` | 知识图谱 | 复杂关系 |
| `hybrid` | 混合模式 | 综合场景 |
| `none` | 无内存 | 无状态 |

```yaml
memory:
  type: "vector"
  maxTokens: 4000
  vectorStore:
    provider: "pinecone"
    indexName: "agent-memory"
    embeddingModel: "text-embedding-ada-002"
```

### 工作流配置 (`workflow`)

```yaml
workflow:
  entryPoint: "start"
  steps:
    - id: "start"
      name: "开始"
      type: "llm"
      config:
        prompt: "分析用户请求"
      next: "process"
    
    - id: "process"
      name: "处理"
      type: "tool"
      config:
        tool: "search"
      next:
        - condition: "success"
          step: "complete"
        - condition: "error"
          step: "error_handler"
    
    - id: "complete"
      name: "完成"
      type: "llm"
      config:
        prompt: "总结结果"
      next: null
```

#### 步骤类型

| 类型 | 说明 |
|------|------|
| `llm` | LLM调用 |
| `tool` | 工具执行 |
| `condition` | 条件分支 |
| `loop` | 循环 |
| `parallel` | 并行执行 |
| `wait` | 等待 |
| `event` | 事件触发 |

### 多Agent配置 (`agents`)

```yaml
agents:
  - id: "planner"
    name: "规划Agent"
    role: "planner"
    model: "gpt-4"
    prompt: "你是一个规划专家..."
    tools: []
  
  - id: "executor"
    name: "执行Agent"
    role: "executor"
    model: "gpt-3.5-turbo"
    prompt: "你擅长执行任务..."
    tools: ["search", "calculator"]
  
  - id: "critic"
    name: "审查Agent"
    role: "critic"
    model: "gpt-4"
    prompt: "你负责审查和优化..."
```

#### Agent角色

| 角色 | 说明 |
|------|------|
| `planner` | 规划者 |
| `executor` | 执行者 |
| `critic` | 批评者 |
| `researcher` | 研究者 |
| `writer` | 撰写者 |
| `reviewer` | 审查者 |
| `custom` | 自定义 |

### 执行配置 (`execution`)

```yaml
execution:
  mode: "async"           # sync, async, streaming, batch
  maxIterations: 10       # 最大迭代次数
  timeout: 300            # 超时(秒)
  retry:
    maxAttempts: 3        # 最大重试次数
    backoff: "exponential" # fixed, linear, exponential
    delay: 1000           # 初始延迟(ms)
```

### 安全配置 (`security`)

```yaml
security:
  sandbox: true
  allowedTools:
    - "search"
    - "calculator"
  blockedTools:
    - "file-write"
  rateLimit:
    requestsPerMinute: 60
    tokensPerMinute: 10000
```

### 可观测性配置 (`observability`)

```yaml
observability:
  logging:
    level: "info"         # debug, info, warn, error
    destination: "console" # console, file, remote
    includePrompts: false
  tracing:
    enabled: true
    provider: "otel"      # jaeger, zipkin, otel, langsmith
  metrics:
    enabled: true
    exportInterval: 60    # 导出间隔(秒)
```

### 部署配置 (`deployment`)

```yaml
deployment:
  platform: "docker"      # local, docker, kubernetes, lambda
  scaling:
    minReplicas: 1
    maxReplicas: 10
    targetCpu: 70
  resources:
    cpu: "1"
    memory: "2Gi"
    gpu: false
```

---

## 配置示例

### 示例1: 简单对话Agent

```yaml
name: "simple-chat"
version: "1.0.0"
description: "简单的对话Agent"
type: "chat"

models:
  provider: "openai"
  model: "gpt-3.5-turbo"
  temperature: 0.8

prompts:
  system: "你是一个友好的AI助手，乐于帮助用户解决问题。"
```

### 示例2: 工具调用Agent

```yaml
name: "research-agent"
version: "1.0.0"
description: "研究助手Agent"
type: "tool-calling"

models:
  provider: "openai"
  model: "gpt-4"
  temperature: 0.3
  maxTokens: 4096

tools:
  - name: "web_search"
    description: "搜索网络信息"
    enabled: true
    timeout: 30
  
  - name: "calculator"
    description: "数学计算"
    enabled: true

execution:
  mode: "async"
  timeout: 120

observability:
  logging:
    level: "info"
```

### 示例3: 工作流Agent

```yaml
name: "customer-support"
version: "2.0.0"
description: "客户支持工作流"
type: "workflow"

models:
  provider: "azure"
  model: "gpt-4"
  baseUrl: "https://your-resource.openai.azure.com"
  apiKey: "${AZURE_OPENAI_KEY}"

workflow:
  entryPoint: "classify"
  steps:
    - id: "classify"
      name: "分类请求"
      type: "llm"
      config:
        prompt: "分类用户请求类型"
      next:
        - condition: "billing"
          step: "billing_handler"
        - condition: "technical"
          step: "tech_handler"
    
    - id: "billing_handler"
      name: "账单处理"
      type: "tool"
      config:
        tool: "lookup_billing"
      next: "response"
    
    - id: "tech_handler"
      name: "技术支持"
      type: "llm"
      config:
        prompt: "提供技术支持"
      next: "response"
    
    - id: "response"
      name: "生成回复"
      type: "llm"
      config:
        prompt: "生成友好回复"
      next: null
```

### 示例4: 多Agent系统

```yaml
name: "content-team"
version: "1.0.0"
description: "内容创作团队"
type: "multi-agent"

models:
  - provider: "openai"
    model: "gpt-4"
  - provider: "anthropic"
    model: "claude-3-opus"

agents:
  - id: "researcher"
    name: "研究员"
    role: "researcher"
    model: "gpt-4"
    prompt: "你是一个研究专家，负责收集和整理信息。"
    tools: ["web_search", "document_reader"]
  
  - id: "writer"
    name: "撰写者"
    role: "writer"
    model: "claude-3-opus"
    prompt: "你是一个专业写作者，负责创作高质量内容。"
  
  - id: "editor"
    name: "编辑"
    role: "reviewer"
    model: "gpt-4"
    prompt: "你是一个资深编辑，负责审查和改进内容。"

memory:
  type: "vector"
  maxTokens: 8000
  vectorStore:
    provider: "pinecone"
    indexName: "content-team"
```

---

## IDE集成指南

### VSCode

#### 方法1: 使用工作区设置

创建 `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "./schemas/agent-config.schema.json": [
      "*.agent.yaml",
      "*.agent.yml"
    ]
  },
  "json.schemas": [
    {
      "fileMatch": ["*.agent.json"],
      "url": "./schemas/agent-config.schema.json"
    }
  ],
  "yaml.validate": true,
  "yaml.format.enable": true
}
```

#### 方法2: 使用YAML头部

在YAML文件顶部添加:

```yaml
# yaml-language-server: $schema=./agent-config.schema.json

name: "my-agent"
version: "1.0.0"
```

#### 方法3: 安装扩展

1. 打开 `vscode-extension` 目录
2. 运行 `npm install`
3. 按 `F5` 启动调试
4. 或打包: `vsce package`

### IntelliJ IDEA / PyCharm

#### 方法1: Settings配置

1. File → Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings
2. 点击 "+" 添加:
   - Schema file: 选择 `agent-config.schema.json`
   - File path pattern: `*.agent.yaml`

#### 方法2: 使用Schema目录

1. 确保 `schema-catalog-entry.json` 在项目中
2. Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Catalog
3. 启用 "Download JSON Schemas from the Schema Catalog"

---

## 故障排除

### 验证工具问题

**Q: 提示 "ajv not found"**
```bash
npm install ajv ajv-formats js-yaml
```

**Q: YAML解析错误**
- 检查缩进 (使用空格，非Tab)
- 检查特殊字符转义
- 使用 `yamllint` 检查格式

### IDE问题

**Q: VSCode不显示自动补全**
1. 确保安装了 YAML 扩展 (Red Hat)
2. 检查 schema 路径是否正确
3. 重新加载窗口: `Ctrl+Shift+P` → "Developer: Reload Window"

**Q: IntelliJ不验证配置**
1. 检查 JSON Schema Mappings 设置
2. 确保文件扩展名匹配
3. 重新启动IDE

### Schema问题

**Q: 需要自定义字段**
使用 `extensions` 字段:

```yaml
name: "my-agent"
version: "1.0.0"

extensions:
  myFramework:
    customField: "value"
    nested:
      key: "value"
```

---

## 最佳实践

1. **版本控制**: 始终使用语义化版本
2. **环境变量**: 敏感信息使用 `${ENV_VAR}` 格式
3. **文档**: 为每个Agent添加清晰的描述
4. **工具超时**: 始终为工具配置超时
5. **沙箱**: 生产环境启用沙箱模式
6. **日志**: 生产环境避免记录prompts

## 参考

- [JSON Schema文档](https://json-schema.org/understanding-json-schema/)
- [YAML规范](https://yaml.org/spec/1.2.2/)
- [EvoMap文档](https://docs.evomap.ai)
