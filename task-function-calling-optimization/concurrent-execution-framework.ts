/**
 * 并发执行框架 - Concurrent Tool Execution Framework
 * 
 * 提供工具并行调用能力，通过依赖图分析实现最优执行顺序
 */

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, any>;
  dependencies?: string[];  // 依赖的其他工具ID
  timeout?: number;         // 超时时间(ms)
  retries?: number;         // 重试次数
}

export interface ToolResult {
  id: string;
  success: boolean;
  data?: any;
  error?: Error;
  latency: number;          // 执行延迟
  startedAt: number;
  endedAt: number;
}

export interface ExecutionPlan {
  levels: ToolCall[][];     // 按执行层级分组
  totalTools: number;
  maxParallelism: number;
  estimatedLatency: number; // 预估延迟
}

export interface ExecutionContext {
  results: Map<string, ToolResult>;
  startTime: number;
  abortController: AbortController;
}

export type ToolExecutor = (call: ToolCall, context: ExecutionContext) => Promise<any>;

/**
 * 并发执行引擎
 */
export class ConcurrentExecutionEngine {
  private executor: ToolExecutor;
  private maxConcurrency: number;
  private defaultTimeout: number;

  constructor(options: {
    executor: ToolExecutor;
    maxConcurrency?: number;
    defaultTimeout?: number;
  }) {
    this.executor = options.executor;
    this.maxConcurrency = options.maxConcurrency || 10;
    this.defaultTimeout = options.defaultTimeout || 30000;
  }

  /**
   * 执行工具调用列表
   */
  async execute(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const plan = this.buildExecutionPlan(toolCalls);
    const context: ExecutionContext = {
      results: new Map(),
      startTime: performance.now(),
      abortController: new AbortController()
    };

    console.log(`[ConcurrentEngine] Execution plan: ${plan.levels.length} levels, max parallelism: ${plan.maxParallelism}`);

    // 按层级顺序执行
    for (let level = 0; level < plan.levels.length; level++) {
      const levelCalls = plan.levels[level];
      console.log(`[ConcurrentEngine] Executing level ${level + 1}/${plan.levels.length} with ${levelCalls.length} tools`);
      
      await this.executeLevel(levelCalls, context);
    }

    // 按原始顺序返回结果
    return toolCalls.map(call => context.results.get(call.id)!);
  }

  /**
   * 构建执行计划 - 基于依赖关系分层
   */
  buildExecutionPlan(toolCalls: ToolCall[]): ExecutionPlan {
    const toolMap = new Map(toolCalls.map(t => [t.id, t]));
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    // 初始化
    toolCalls.forEach(call => {
      inDegree.set(call.id, call.dependencies?.length || 0);
      dependents.set(call.id, []);
    });

    // 构建依赖图
    toolCalls.forEach(call => {
      call.dependencies?.forEach(depId => {
        if (toolMap.has(depId)) {
          dependents.get(depId)!.push(call.id);
        }
      });
    });

    // 拓扑排序分层
    const levels: ToolCall[][] = [];
    let currentLevel: ToolCall[] = [];
    let remaining = new Set(toolCalls.map(t => t.id));

    while (remaining.size > 0) {
      currentLevel = [];
      
      for (const id of remaining) {
        if (inDegree.get(id) === 0) {
          currentLevel.push(toolMap.get(id)!);
        }
      }

      if (currentLevel.length === 0) {
        throw new Error('Circular dependency detected in tool calls');
      }

      levels.push(currentLevel);
      
      // 更新剩余节点和入度
      currentLevel.forEach(call => {
        remaining.delete(call.id);
        dependents.get(call.id)!.forEach(depId => {
          inDegree.set(depId, inDegree.get(depId)! - 1);
        });
      });
    }

    const maxParallelism = Math.max(...levels.map(l => l.length));

    return {
      levels,
      totalTools: toolCalls.length,
      maxParallelism,
      estimatedLatency: this.estimateLatency(levels)
    };
  }

  /**
   * 执行单个层级
   */
  private async executeLevel(calls: ToolCall[], context: ExecutionContext): Promise<void> {
    const executing = calls.map(call => this.executeSingle(call, context));
    
    // 限制并发数
    if (calls.length > this.maxConcurrency) {
      const results: ToolResult[] = [];
      for (let i = 0; i < calls.length; i += this.maxConcurrency) {
        const batch = executing.slice(i, i + this.maxConcurrency);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
      }
    } else {
      await Promise.all(executing);
    }
  }

  /**
   * 执行单个工具
   */
  private async executeSingle(call: ToolCall, context: ExecutionContext): Promise<ToolResult> {
    const startedAt = performance.now();
    const timeout = call.timeout || this.defaultTimeout;
    const maxRetries = call.retries || 0;

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 检查是否已取消
        if (context.abortController.signal.aborted) {
          throw new Error('Execution cancelled');
        }

        // 等待依赖完成
        if (call.dependencies) {
          await this.waitForDependencies(call.dependencies, context);
        }

        // 执行工具
        const data = await this.runWithTimeout(call, context, timeout);
        
        const endedAt = performance.now();
        const result: ToolResult = {
          id: call.id,
          success: true,
          data,
          latency: endedAt - startedAt,
          startedAt,
          endedAt
        };

        context.results.set(call.id, result);
        return result;

      } catch (error) {
        lastError = error as Error;
        console.warn(`[ConcurrentEngine] Tool ${call.name} attempt ${attempt + 1} failed:`, error);
        
        if (attempt < maxRetries) {
          await this.delay(Math.pow(2, attempt) * 100); // 指数退避
        }
      }
    }

    const endedAt = performance.now();
    const result: ToolResult = {
      id: call.id,
      success: false,
      error: lastError,
      latency: endedAt - startedAt,
      startedAt,
      endedAt
    };

    context.results.set(call.id, result);
    return result;
  }

  /**
   * 等待依赖完成
   */
  private async waitForDependencies(dependencies: string[], context: ExecutionContext): Promise<void> {
    const checkInterval = 10;
    
    while (true) {
      const allReady = dependencies.every(id => {
        const result = context.results.get(id);
        return result !== undefined;
      });

      if (allReady) {
        // 检查是否有依赖失败
        const failedDeps = dependencies.filter(id => {
          const result = context.results.get(id);
          return result && !result.success;
        });

        if (failedDeps.length > 0) {
          throw new Error(`Dependencies failed: ${failedDeps.join(', ')}`);
        }

        return;
      }

      await this.delay(checkInterval);
    }
  }

  /**
   * 带超时的执行
   */
  private async runWithTimeout(
    call: ToolCall, 
    context: ExecutionContext, 
    timeout: number
  ): Promise<any> {
    return Promise.race([
      this.executor(call, context),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
      })
    ]);
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 预估延迟
   */
  private estimateLatency(levels: ToolCall[][]): number {
    // 简化估算：假设每个工具平均 500ms
    const avgToolLatency = 500;
    return levels.length * avgToolLatency;
  }

  /**
   * 取消执行
   */
  cancel(): void {
    // 通过 abortController 信号取消
  }
}

/**
 * 快速并行执行 - 无依赖场景
 */
export async function parallelExecute<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number = 10
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  
  for (let i = 0; i < tasks.length; i += maxConcurrency) {
    const batch = tasks.slice(i, i + maxConcurrency);
    const batchResults = await Promise.allSettled(batch.map(t => t()));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * 使用示例
 */
export async function example() {
  // 定义工具执行器
  const executor: ToolExecutor = async (call, context) => {
    // 实际工具调用逻辑
    switch (call.name) {
      case 'getWeather':
        return { temperature: 25, condition: 'sunny' };
      case 'getStockPrice':
        return { symbol: call.params.symbol, price: 150.5 };
      default:
        throw new Error(`Unknown tool: ${call.name}`);
    }
  };

  // 创建引擎
  const engine = new ConcurrentExecutionEngine({
    executor,
    maxConcurrency: 5,
    defaultTimeout: 10000
  });

  // 定义工具调用
  const toolCalls: ToolCall[] = [
    { id: '1', name: 'getWeather', params: { city: 'Beijing' } },
    { id: '2', name: 'getStockPrice', params: { symbol: 'AAPL' } },
    { id: '3', name: 'getNews', params: { query: 'tech' }, dependencies: ['1', '2'] }
  ];

  // 执行
  const results = await engine.execute(toolCalls);
  console.log('Results:', results);
}
