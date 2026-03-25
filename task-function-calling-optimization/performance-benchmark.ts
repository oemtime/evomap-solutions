/**
 * 性能测试 - Performance Benchmark
 * 
 * 对比串行 vs 并发执行的性能差异
 */

import { ConcurrentExecutionEngine, ToolCall, ToolExecutor } from './concurrent-execution-framework';
import { DependencyManager } from './dependency-manager';
import { ResultMerger, MergeConfig } from './result-merger';

export interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  toolLatencies: number[];  // 模拟工具延迟
  dependencyRatio: number;  // 0-1, 依赖比例
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  serial: {
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    p95: number;
    p99: number;
  };
  concurrent: {
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    p95: number;
    p99: number;
  };
  improvement: {
    avgMs: number;
    percentage: number;
    speedup: number;
  };
  metadata: {
    toolCount: number;
    dependencyCount: number;
    maxParallelism: number;
  };
}

/**
 * 性能测试套件
 */
export class PerformanceBenchmark {
  private config: BenchmarkConfig;

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = {
      iterations: 100,
      warmupIterations: 10,
      toolLatencies: [100, 200, 300, 400, 500],
      dependencyRatio: 0.3,
      ...config
    };
  }

  /**
   * 运行完整测试
   */
  async runFullBenchmark(): Promise<BenchmarkResult[]> {
    console.log('🏃 Starting Function Calling Performance Benchmark\n');

    const results: BenchmarkResult[] = [];

    // 测试场景 1: 无依赖工具
    results.push(await this.benchmarkScenario('No Dependencies (5 tools)', 5, 0));
    
    // 测试场景 2: 少量依赖
    results.push(await this.benchmarkScenario('Light Dependencies (5 tools)', 5, 0.2));
    
    // 测试场景 3: 中等依赖
    results.push(await this.benchmarkScenario('Medium Dependencies (8 tools)', 8, 0.4));
    
    // 测试场景 4: 复杂依赖
    results.push(await this.benchmarkScenario('Complex Dependencies (10 tools)', 10, 0.6));
    
    // 测试场景 5: 大量独立工具
    results.push(await this.benchmarkScenario('Many Independent Tools (20 tools)', 20, 0));

    return results;
  }

  /**
   * 测试特定场景
   */
  private async benchmarkScenario(
    name: string,
    toolCount: number,
    dependencyRatio: number
  ): Promise<BenchmarkResult> {
    console.log(`📊 Testing: ${name}`);

    // 生成测试工具
    const toolCalls = this.generateToolCalls(toolCount, dependencyRatio);
    
    // 计算依赖统计
    const depManager = new DependencyManager();
    const graph = depManager.buildGraph(toolCalls);
    const dependencyCount = toolCalls.reduce((sum, t) => sum + (t.dependencies?.length || 0), 0);

    // 预热
    console.log('  Warming up...');
    for (let i = 0; i < this.config.warmupIterations; i++) {
      await this.runSerial(toolCalls);
      await this.runConcurrent(toolCalls);
    }

    // 串行测试
    console.log('  Running serial tests...');
    const serialLatencies: number[] = [];
    for (let i = 0; i < this.config.iterations; i++) {
      const latency = await this.runSerial(toolCalls);
      serialLatencies.push(latency);
    }

    // 并发测试
    console.log('  Running concurrent tests...');
    const concurrentLatencies: number[] = [];
    for (let i = 0; i < this.config.iterations; i++) {
      const latency = await this.runConcurrent(toolCalls);
      concurrentLatencies.push(latency);
    }

    // 计算统计
    const result: BenchmarkResult = {
      name,
      iterations: this.config.iterations,
      serial: this.calculateStats(serialLatencies),
      concurrent: this.calculateStats(concurrentLatencies),
      improvement: this.calculateImprovement(serialLatencies, concurrentLatencies),
      metadata: {
        toolCount,
        dependencyCount,
        maxParallelism: Math.max(...graph.levels.map(l => l.length))
      }
    };

    console.log(`  ✓ Serial avg: ${result.serial.avgLatency.toFixed(2)}ms`);
    console.log(`  ✓ Concurrent avg: ${result.concurrent.avgLatency.toFixed(2)}ms`);
    console.log(`  ✓ Improvement: ${result.improvement.percentage.toFixed(1)}% (${result.improvement.speedup.toFixed(2)}x speedup)\n`);

    return result;
  }

  /**
   * 生成测试工具调用
   */
  private generateToolCalls(count: number, dependencyRatio: number): ToolCall[] {
    const calls: ToolCall[] = [];

    for (let i = 0; i < count; i++) {
      const latency = this.config.toolLatencies[i % this.config.toolLatencies.length];
      
      calls.push({
        id: `tool-${i}`,
        name: `Tool${i}`,
        params: { latency },
        dependencies: [],
        timeout: 10000
      });
    }

    // 添加依赖
    if (dependencyRatio > 0) {
      const depCount = Math.floor(count * dependencyRatio);
      for (let i = 1; i < count && depCount > 0; i++) {
        if (Math.random() < dependencyRatio) {
          const depIndex = Math.floor(Math.random() * i);
          calls[i].dependencies = [`tool-${depIndex}`];
        }
      }
    }

    return calls;
  }

  /**
   * 串行执行
   */
  private async runSerial(toolCalls: ToolCall[]): Promise<number> {
    const start = performance.now();

    for (const call of toolCalls) {
      // 等待依赖
      if (call.dependencies) {
        // 模拟等待
      }
      
      // 模拟执行
      const latency = call.params.latency || 100;
      await this.delay(latency);
    }

    return performance.now() - start;
  }

  /**
   * 并发执行
   */
  private async runConcurrent(toolCalls: ToolCall[]): Promise<number> {
    const executor: ToolExecutor = async (call) => {
      const latency = call.params.latency || 100;
      await this.delay(latency);
      return { success: true };
    };

    const engine = new ConcurrentExecutionEngine({
      executor,
      maxConcurrency: 10
    });

    const start = performance.now();
    await engine.execute(toolCalls);
    return performance.now() - start;
  }

  /**
   * 延迟辅助
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 计算统计
   */
  private calculateStats(latencies: number[]) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      avgLatency: sum / sorted.length,
      minLatency: sorted[0],
      maxLatency: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * 计算改进
   */
  private calculateImprovement(serial: number[], concurrent: number[]) {
    const serialAvg = serial.reduce((a, b) => a + b, 0) / serial.length;
    const concurrentAvg = concurrent.reduce((a, b) => a + b, 0) / concurrent.length;
    
    return {
      avgMs: serialAvg - concurrentAvg,
      percentage: ((serialAvg - concurrentAvg) / serialAvg) * 100,
      speedup: serialAvg / concurrentAvg
    };
  }

  /**
   * 生成报告
   */
  generateReport(results: BenchmarkResult[]): string {
    const lines: string[] = [
      '# Function Calling Performance Benchmark Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Iterations per scenario: ${this.config.iterations}`,
      '',
      '## Summary',
      ''
    ];

    // 汇总表
    lines.push('| Scenario | Tools | Deps | Serial (ms) | Concurrent (ms) | Improvement | Speedup |');
    lines.push('|----------|-------|------|-------------|-----------------|-------------|---------|');

    results.forEach(r => {
      lines.push(
        `| ${r.name} | ${r.metadata.toolCount} | ${r.metadata.dependencyCount} | ` +
        `${r.serial.avgLatency.toFixed(1)} | ${r.concurrent.avgLatency.toFixed(1)} | ` +
        `${r.improvement.percentage.toFixed(1)}% | ${r.improvement.speedup.toFixed(2)}x |`
      );
    });

    lines.push('');
    lines.push('## Detailed Results');
    lines.push('');

    results.forEach(r => {
      lines.push(`### ${r.name}`);
      lines.push('');
      lines.push('**Serial Execution:**');
      lines.push(`- Average: ${r.serial.avgLatency.toFixed(2)}ms`);
      lines.push(`- Min/Max: ${r.serial.minLatency.toFixed(2)}ms / ${r.serial.maxLatency.toFixed(2)}ms`);
      lines.push(`- P95/P99: ${r.serial.p95.toFixed(2)}ms / ${r.serial.p99.toFixed(2)}ms`);
      lines.push('');
      lines.push('**Concurrent Execution:**');
      lines.push(`- Average: ${r.concurrent.avgLatency.toFixed(2)}ms`);
      lines.push(`- Min/Max: ${r.concurrent.minLatency.toFixed(2)}ms / ${r.concurrent.maxLatency.toFixed(2)}ms`);
      lines.push(`- P95/P99: ${r.concurrent.p95.toFixed(2)}ms / ${r.concurrent.p99.toFixed(2)}ms`);
      lines.push('');
      lines.push('**Improvement:**');
      lines.push(`- Time saved: ${r.improvement.avgMs.toFixed(2)}ms`);
      lines.push(`- Percentage: ${r.improvement.percentage.toFixed(1)}%`);
      lines.push(`- Speedup: ${r.improvement.speedup.toFixed(2)}x`);
      lines.push('');
    });

    return lines.join('\n');
  }
}

/**
 * 快速对比测试
 */
export async function quickBenchmark(): Promise<void> {
  const benchmark = new PerformanceBenchmark({
    iterations: 50,
    warmupIterations: 5
  });

  const results = await benchmark.runFullBenchmark();
  console.log('\n' + '='.repeat(60));
  console.log(benchmark.generateReport(results));
}

// 如果直接运行
if (require.main === module) {
  quickBenchmark();
}
