/**
 * 结果合并器 - Result Merger
 * 
 * 处理并行工具执行的结果合并，支持多种合并策略
 */

import { ToolResult } from './concurrent-execution-framework';

export interface MergeStrategy {
  name: string;
  merge(results: ToolResult[]): any;
}

export interface MergeConfig {
  strategy: 'parallel' | 'sequential' | 'aggregate' | 'custom';
  customStrategy?: MergeStrategy;
  aggregationKey?: string;
  includeMetadata?: boolean;
  errorHandling?: 'fail-fast' | 'ignore-errors' | 'partial-success';
}

export interface MergedResult {
  success: boolean;
  data: any;
  metadata: {
    totalTools: number;
    successfulTools: number;
    failedTools: number;
    totalLatency: number;
    startedAt: number;
    endedAt: number;
    parallelizationRatio: number;
  };
  errors?: Error[];
  partialResults?: ToolResult[];
}

/**
 * 结果合并器
 */
export class ResultMerger {
  /**
   * 并行合并策略 - 所有结果平级合并
   */
  static parallelStrategy: MergeStrategy = {
    name: 'parallel',
    merge(results: ToolResult[]) {
      const merged: Record<string, any> = {};
      
      results.forEach(result => {
        if (result.success && result.data !== undefined) {
          // 使用工具ID作为键
          merged[result.id] = result.data;
          
          // 如果数据有命名空间，也平铺合并
          if (typeof result.data === 'object' && result.data !== null) {
            Object.entries(result.data).forEach(([key, value]) => {
              const uniqueKey = `${result.id}_${key}`;
              merged[uniqueKey] = value;
            });
          }
        }
      });

      return merged;
    }
  };

  /**
   * 顺序合并策略 - 按执行顺序合并，后续可覆盖前序
   */
  static sequentialStrategy: MergeStrategy = {
    name: 'sequential',
    merge(results: ToolResult[]) {
      // 按开始时间排序
      const sorted = [...results].sort((a, b) => a.startedAt - b.startedAt);
      
      let merged: any = {};
      
      sorted.forEach(result => {
        if (result.success && result.data !== undefined) {
          if (typeof result.data === 'object' && result.data !== null && !Array.isArray(result.data)) {
            merged = { ...merged, ...result.data };
          } else {
            merged[result.id] = result.data;
          }
        }
      });

      return merged;
    }
  };

  /**
   * 聚合策略 - 将结果聚合为数组
   */
  static aggregateStrategy: MergeStrategy = {
    name: 'aggregate',
    merge(results: ToolResult[]) {
      return {
        results: results.map(r => ({
          id: r.id,
          success: r.success,
          data: r.data,
          error: r.error?.message,
          latency: r.latency
        }))
      };
    }
  };

  /**
   * 智能合并策略 - 根据数据类型自动选择
   */
  static smartStrategy: MergeStrategy = {
    name: 'smart',
    merge(results: ToolResult[]) {
      const successfulResults = results.filter(r => r.success && r.data !== undefined);
      
      if (successfulResults.length === 0) {
        return {};
      }

      // 检查数据类型
      const allArrays = successfulResults.every(r => Array.isArray(r.data));
      const allObjects = successfulResults.every(r => 
        typeof r.data === 'object' && r.data !== null && !Array.isArray(r.data)
      );

      if (allArrays) {
        // 合并数组
        return {
          items: successfulResults.flatMap(r => r.data),
          sources: successfulResults.map(r => r.id)
        };
      }

      if (allObjects) {
        // 合并对象
        const merged: Record<string, any> = {};
        successfulResults.forEach(r => {
          Object.entries(r.data).forEach(([key, value]) => {
            if (merged[key] === undefined) {
              merged[key] = value;
            } else if (Array.isArray(merged[key])) {
              merged[key] = [...merged[key], value];
            } else {
              merged[key] = [merged[key], value];
            }
          });
        });
        return merged;
      }

      // 默认使用并行策略
      return ResultMerger.parallelStrategy.merge(results);
    }
  };

  /**
   * 执行合并
   */
  static merge(results: ToolResult[], config: MergeConfig): MergedResult {
    const startedAt = Math.min(...results.map(r => r.startedAt));
    const endedAt = Math.max(...results.map(r => r.endedAt));
    const totalLatency = endedAt - startedAt;

    // 错误处理
    const errors: Error[] = [];
    const failedResults = results.filter(r => !r.success);
    
    switch (config.errorHandling) {
      case 'fail-fast':
        if (failedResults.length > 0) {
          return {
            success: false,
            data: null,
            metadata: this.createMetadata(results, totalLatency, startedAt, endedAt),
            errors: failedResults.map(r => r.error!)
          };
        }
        break;

      case 'ignore-errors':
        // 继续处理，忽略错误
        break;

      case 'partial-success':
      default:
        failedResults.forEach(r => {
          if (r.error) errors.push(r.error);
        });
        break;
    }

    // 选择合并策略
    let strategy: MergeStrategy;
    switch (config.strategy) {
      case 'parallel':
        strategy = this.parallelStrategy;
        break;
      case 'sequential':
        strategy = this.sequentialStrategy;
        break;
      case 'aggregate':
        strategy = this.aggregateStrategy;
        break;
      case 'custom':
        strategy = config.customStrategy || this.smartStrategy;
        break;
      default:
        strategy = this.smartStrategy;
    }

    // 执行合并
    const mergedData = strategy.merge(results);

    // 添加聚合键
    if (config.aggregationKey) {
      mergedData[config.aggregationKey] = {
        count: results.length,
        successful: results.filter(r => r.success).length,
        failed: failedResults.length,
        totalLatency
      };
    }

    return {
      success: failedResults.length === 0 || config.errorHandling !== 'fail-fast',
      data: mergedData,
      metadata: this.createMetadata(results, totalLatency, startedAt, endedAt),
      errors: errors.length > 0 ? errors : undefined,
      partialResults: config.errorHandling === 'partial-success' && failedResults.length > 0 
        ? failedResults 
        : undefined
    };
  }

  /**
   * 创建元数据
   */
  private static createMetadata(
    results: ToolResult[],
    totalLatency: number,
    startedAt: number,
    endedAt: number
  ): MergedResult['metadata'] {
    const successful = results.filter(r => r.success).length;
    const sumLatency = results.reduce((sum, r) => sum + r.latency, 0);
    
    return {
      totalTools: results.length,
      successfulTools: successful,
      failedTools: results.length - successful,
      totalLatency,
      startedAt,
      endedAt,
      parallelizationRatio: sumLatency > 0 ? sumLatency / totalLatency : 1
    };
  }

  /**
   * 流式合并 - 支持渐进式结果
   */
  static createStreamingMerger(
    config: MergeConfig,
    onUpdate: (result: MergedResult) => void
  ) {
    const results: ToolResult[] = [];
    let completed = false;

    return {
      addResult(result: ToolResult): void {
        if (completed) return;
        results.push(result);
        onUpdate(this.getCurrentResult());
      },

      complete(): MergedResult {
        completed = true;
        const final = ResultMerger.merge(results, config);
        onUpdate(final);
        return final;
      },

      getCurrentResult(): MergedResult {
        return ResultMerger.merge(results, {
          ...config,
          errorHandling: 'ignore-errors' // 流式过程中忽略错误
        });
      }
    };
  }

  /**
   * 创建自定义策略
   */
  static createCustomStrategy(
    name: string,
    merger: (results: ToolResult[]) => any
  ): MergeStrategy {
    return { name, merge: merger };
  }
}

/**
 * 结果转换器 - 转换工具结果格式
 */
export class ResultTransformer {
  /**
   * 展平嵌套结果
   */
  static flatten(data: any, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};

    if (data === null || typeof data !== 'object') {
      result[prefix] = data;
      return result;
    }

    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        const key = prefix ? `${prefix}[${index}]` : `[${index}]`;
        Object.assign(result, this.flatten(item, key));
      });
    } else {
      Object.entries(data).forEach(([key, value]) => {
        const newKey = prefix ? `${prefix}.${key}` : key;
        Object.assign(result, this.flatten(value, newKey));
      });
    }

    return result;
  }

  /**
   * 提取特定路径的值
   */
  static extract(data: any, path: string): any {
    const keys = path.split('.');
    let current = data;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      // 支持数组索引
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, prop, index] = arrayMatch;
        current = current[prop]?.[parseInt(index)];
      } else {
        current = current[key];
      }
    }

    return current;
  }

  /**
   * 映射结果格式
   */
  static map(data: any, mapping: Record<string, string>): any {
    const result: Record<string, any> = {};

    Object.entries(mapping).forEach(([targetKey, sourcePath]) => {
      result[targetKey] = this.extract(data, sourcePath);
    });

    return result;
  }
}

/**
 * 使用示例
 */
export function example() {
  const results: ToolResult[] = [
    {
      id: 'weather',
      success: true,
      data: { temperature: 25, condition: 'sunny' },
      latency: 300,
      startedAt: 0,
      endedAt: 300
    },
    {
      id: 'stock',
      success: true,
      data: { symbol: 'AAPL', price: 150.5 },
      latency: 400,
      startedAt: 0,
      endedAt: 400
    },
    {
      id: 'news',
      success: false,
      error: new Error('API timeout'),
      latency: 5000,
      startedAt: 0,
      endedAt: 5000
    }
  ];

  // 并行合并
  const parallel = ResultMerger.merge(results, {
    strategy: 'parallel',
    errorHandling: 'partial-success'
  });
  console.log('Parallel:', parallel);

  // 聚合合并
  const aggregate = ResultMerger.merge(results, {
    strategy: 'aggregate',
    errorHandling: 'ignore-errors'
  });
  console.log('Aggregate:', aggregate);

  // 智能合并
  const smart = ResultMerger.merge(results, {
    strategy: 'smart',
    errorHandling: 'partial-success'
  });
  console.log('Smart:', smart);

  return { parallel, aggregate, smart };
}
