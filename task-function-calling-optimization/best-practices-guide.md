# Function Calling 并发优化最佳实践指南

## 概述

本指南提供 Function Calling 延迟优化的最佳实践，帮助开发者实现高效的并发工具执行。

## 核心原则

### 1. 识别并行机会

```typescript
// ❌ 错误：不必要的串行
const weather = await getWeather();
const stock = await getStockPrice();  // 不依赖weather，可并行
const news = await getNews();         // 不依赖前面结果，可并行

// ✅ 正确：使用并发执行
const results = await concurrentExecute([
  () => getWeather(),
  () => getStockPrice(),
  () => getNews()
]);
```

### 2. 正确声明依赖

```typescript
const toolCalls: ToolCall[] = [
  { 
    id: 'location', 
    name: 'getLocation', 
    params: { city: 'Beijing' } 
  },
  { 
    id: 'weather', 
    name: 'getWeather', 
    params: {},
    dependencies: ['location']  // 明确声明依赖
  }
];
```

### 3. 合理设置超时

```typescript
const engine = new ConcurrentExecutionEngine({
  executor,
  defaultTimeout: 10000,  // 默认10秒
  maxConcurrency: 10      // 最大并发数
});

// 为特定工具设置不同超时
const toolCalls: ToolCall[] = [
  { id: '1', name: 'quickQuery', params: {}, timeout: 2000 },   // 2秒
  { id: '2', name: 'heavyCompute', params: {}, timeout: 30000 } // 30秒
];
```

## 架构模式

### 模式 1: 独立工具并行

适用于多个无依赖的工具调用：

```typescript
import { parallelExecute } from './concurrent-execution-framework';

async function fetchUserData(userId: string) {
  const [profile, orders, preferences] = await Promise.all([
    fetchUserProfile(userId),
    fetchUserOrders(userId),
    fetchUserPreferences(userId)
  ]);
  
  return { profile, orders, preferences };
}
```

### 模式 2: 依赖链执行

适用于有依赖关系的工具：

```typescript
import { ConcurrentExecutionEngine, DependencyManager } from './concurrent-execution-framework';

async function complexWorkflow() {
  const manager = new DependencyManager();
  
  const toolCalls = [
    { id: 'auth', name: 'authenticate', params: {} },
    { id: 'data', name: 'fetchData', params: {}, dependencies: ['auth'] },
    { id: 'process', name: 'processData', params: {}, dependencies: ['data'] }
  ];
  
  const graph = manager.buildGraph(toolCalls);
  console.log(manager.visualize(graph));
  
  const engine = new ConcurrentExecutionEngine({ executor });
  return await engine.execute(toolCalls);
}
```

### 模式 3: 混合模式

结合并行和串行：

```typescript
async function mixedWorkflow() {
  // 第一阶段：并行获取基础数据
  const [user, config] = await Promise.all([
    fetchUser(),
    fetchConfig()
  ]);
  
  // 第二阶段：基于基础数据并行获取详情
  const [details, permissions] = await Promise.all([
    fetchUserDetails(user.id),
    fetchUserPermissions(user.id)
  ]);
  
  // 第三阶段：整合处理
  return processResults(user, config, details, permissions);
}
```

## 性能优化技巧

### 1. 连接池复用

```typescript
// 使用HTTP/2连接池
const http2Pool = new Http2ConnectionPool({
  maxConnections: 10,
  keepAlive: true
});

const executor: ToolExecutor = async (call) => {
  return http2Pool.request({
    method: 'POST',
    path: `/api/${call.name}`,
    body: call.params
  });
};
```

### 2. 智能重试策略

```typescript
const toolCalls: ToolCall[] = [
  {
    id: '1',
    name: 'unreliableService',
    params: {},
    retries: 3,           // 最多重试3次
    timeout: 5000         // 每次5秒超时
  }
];

// 引擎自动使用指数退避
// 第1次: 立即重试
// 第2次: 等待200ms
// 第3次: 等待400ms
```

### 3. 结果缓存

```typescript
class CachedExecutor {
  private cache = new Map<string, { data: any; expiry: number }>();
  
  async execute(call: ToolCall): Promise<any> {
    const cacheKey = `${call.name}:${JSON.stringify(call.params)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    
    const result = await this.doExecute(call);
    this.cache.set(cacheKey, {
      data: result,
      expiry: Date.now() + 60000 // 1分钟缓存
    });
    
    return result;
  }
}
```

### 4. 流式结果处理

```typescript
import { ResultMerger } from './result-merger';

async function streamingExecution() {
  const merger = ResultMerger.createStreamingMerger(
    { strategy: 'aggregate', errorHandling: 'ignore-errors' },
    (result) => {
      // 实时更新UI
      updateProgress(result.metadata);
    }
  );
  
  // 渐进式添加结果
  tools.forEach(async (tool) => {
    const result = await executeTool(tool);
    merger.addResult(result);
  });
  
  return merger.complete();
}
```

## 错误处理

### 1. 失败隔离

```typescript
const config: MergeConfig = {
  strategy: 'smart',
  errorHandling: 'partial-success'  // 允许部分成功
};

const result = ResultMerger.merge(results, config);

if (!result.success) {
  console.warn('Some tools failed:', result.errors);
  // 仍然可以使用部分结果
  console.log('Partial results:', result.data);
}
```

### 2. 优雅降级

```typescript
async function withFallback(primary: ToolCall, fallback: ToolCall) {
  const engine = new ConcurrentExecutionEngine({
    executor: async (call) => {
      try {
        return await executePrimary(call);
      } catch (error) {
        if (call.id === primary.id) {
          console.warn('Primary failed, using fallback');
          return await executeFallback(fallback);
        }
        throw error;
      }
    }
  });
  
  return await engine.execute([primary]);
}
```

### 3. 断路器模式

```typescript
class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      throw new Error('Circuit breaker is open');
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onFailure() {
    this.failures++;
    if (this.failures >= 5) {
      this.state = 'open';
      setTimeout(() => this.state = 'half-open', 30000);
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
}
```

## 监控与调试

### 1. 延迟追踪

```typescript
import { LatencyProfiler } from './latency-profiler';

const profiler = new LatencyProfiler();

async function tracedExecution() {
  profiler.startSpan('total');
  
  profiler.startSpan('llm_inference');
  const toolCalls = await llm.generateToolCalls();
  profiler.endSpan('llm_inference');
  
  profiler.startSpan('tool_execution');
  const results = await engine.execute(toolCalls);
  profiler.endSpan('tool_execution');
  
  const total = profiler.endSpan('total');
  console.log(`Total latency: ${total}ms`);
}
```

### 2. 依赖图可视化

```typescript
const manager = new DependencyManager();
const graph = manager.buildGraph(toolCalls);

// 打印文本可视化
console.log(manager.visualize(graph));

// 生成Mermaid图表
const mermaid = generateMermaidGraph(graph);
console.log(mermaid);
```

### 3. 性能指标收集

```typescript
interface PerformanceMetrics {
  toolName: string;
  callCount: number;
  avgLatency: number;
  p95Latency: number;
  errorRate: number;
  cacheHitRate: number;
}

class MetricsCollector {
  private metrics = new Map<string, PerformanceMetrics>();
  
  record(call: ToolCall, result: ToolResult) {
    const existing = this.metrics.get(call.name);
    if (existing) {
      existing.callCount++;
      existing.avgLatency = (existing.avgLatency * (existing.callCount - 1) + result.latency) / existing.callCount;
    } else {
      this.metrics.set(call.name, {
        toolName: call.name,
        callCount: 1,
        avgLatency: result.latency,
        p95Latency: result.latency,
        errorRate: result.success ? 0 : 1,
        cacheHitRate: 0
      });
    }
  }
}
```

## 常见陷阱

### 1. 过度并行

```typescript
// ❌ 错误：并发数过高可能导致资源耗尽
const engine = new ConcurrentExecutionEngine({
  maxConcurrency: 1000  // 太多！
});

// ✅ 正确：根据系统能力设置合理限制
const engine = new ConcurrentExecutionEngine({
  maxConcurrency: 10  // 根据CPU/IO能力调整
});
```

### 2. 忽略依赖

```typescript
// ❌ 错误：未声明依赖可能导致竞态条件
const calls = [
  { id: '1', name: 'createUser', params: {} },
  { id: '2', name: 'updateUser', params: {} }  // 依赖createUser！
];

// ✅ 正确：明确声明依赖
const calls = [
  { id: '1', name: 'createUser', params: {} },
  { id: '2', name: 'updateUser', params: {}, dependencies: ['1'] }
];
```

### 3. 超时设置不当

```typescript
// ❌ 错误：超时过长导致资源浪费
timeout: 60000  // 1分钟

// ✅ 正确：根据工具特性设置合理超时
timeout: 5000   // 5秒，快速失败
```

## 总结

| 优化策略 | 预期收益 | 实施难度 |
|---------|---------|---------|
| 并发执行 | 60-80% | 低 |
| 连接池复用 | 10-15% | 低 |
| 结果缓存 | 20-40% | 中 |
| 智能重试 | 5-10% | 低 |
| 流式处理 | 感知提升 | 中 |

遵循这些最佳实践，可以显著降低 Function Calling 的端到端延迟，提升用户体验。
