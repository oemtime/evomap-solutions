/**
 * 基准测试工具
 * 对比 RESTful、gRPC、Message Queue 的性能
 */

import { performance } from 'perf_hooks';
import { RESTClient, createRESTServer } from '../protocols/rest.js';
import { GRPCClient, createGRPCServer } from '../protocols/grpc.js';
import { MQClient, MessageQueueService } from '../protocols/mq.js';

// 统计类
class Statistics {
  constructor() {
    this.measurements = [];
  }

  add(value) {
    this.measurements.push(value);
  }

  get results() {
    const sorted = [...this.measurements].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      count: n,
      min: sorted[0],
      max: sorted[n - 1],
      mean: sum / n,
      p50: sorted[Math.floor(n * 0.5)],
      p90: sorted[Math.floor(n * 0.9)],
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)]
    };
  }
}

// 基准测试配置
const CONFIG = {
  warmupIterations: 100,
  benchmarkIterations: 1000,
  concurrentConnections: [1, 10, 50, 100],
  payloadSizes: [100, 1000, 10000] // bytes
};

// 生成测试负载
function generatePayload(size) {
  return 'x'.repeat(size);
}

// RESTful 基准测试
async function benchmarkRESTful(iterations = CONFIG.benchmarkIterations) {
  console.log('Starting RESTful benchmark...');
  
  const stats = new Statistics();
  const client = new RESTClient('http://localhost:3001');
  
  // 预热
  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    await client.sendMessage(`agent_${i % 10}`, `agent_${(i + 1) % 10}`, 'warmup');
  }
  
  // 基准测试
  const startTime = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    const reqStart = performance.now();
    await client.sendMessage(`agent_${i % 10}`, `agent_${(i + 1) % 10}`, generatePayload(100));
    stats.add(performance.now() - reqStart);
  }
  
  const totalTime = performance.now() - startTime;
  const results = stats.results;
  
  return {
    protocol: 'RESTful',
    totalTime,
    throughput: (iterations / totalTime * 1000).toFixed(2), // RPS
    ...results
  };
}

// gRPC 基准测试
async function benchmarkGRPC(iterations = CONFIG.benchmarkIterations) {
  console.log('Starting gRPC benchmark...');
  
  const stats = new Statistics();
  const client = new GRPCClient('localhost:50051');
  
  // 预热
  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    await client.sendMessage(`agent_${i % 10}`, `agent_${(i + 1) % 10}`, 'warmup');
  }
  
  // 基准测试
  const startTime = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    const reqStart = performance.now();
    await client.sendMessage(`agent_${i % 10}`, `agent_${(i + 1) % 10}`, generatePayload(100));
    stats.add(performance.now() - reqStart);
  }
  
  const totalTime = performance.now() - startTime;
  const results = stats.results;
  
  client.close();
  
  return {
    protocol: 'gRPC',
    totalTime,
    throughput: (iterations / totalTime * 1000).toFixed(2),
    ...results
  };
}

// Message Queue 基准测试
async function benchmarkMQ(iterations = CONFIG.benchmarkIterations) {
  console.log('Starting Message Queue benchmark...');
  
  const stats = new Statistics();
  const client = new MQClient();
  await client.connect('benchmark_agent', { type: 'benchmark' });
  
  // 预热
  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    await client.sendMessage(`agent_${(i + 1) % 10}`, 'warmup');
  }
  
  // 基准测试
  const startTime = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    const reqStart = performance.now();
    await client.sendMessage(`agent_${(i + 1) % 10}`, generatePayload(100));
    stats.add(performance.now() - reqStart);
  }
  
  const totalTime = performance.now() - startTime;
  const results = stats.results;
  
  await client.close();
  
  return {
    protocol: 'MessageQueue',
    totalTime,
    throughput: (iterations / totalTime * 1000).toFixed(2),
    ...results
  };
}

// 并发测试
async function benchmarkConcurrent(protocol, concurrency = 10, iterations = 100) {
  console.log(`Starting concurrent benchmark for ${protocol} with ${concurrency} connections...`);
  
  const stats = new Statistics();
  const clients = [];
  
  // 创建客户端
  for (let i = 0; i < concurrency; i++) {
    if (protocol === 'RESTful') {
      clients.push(new RESTClient('http://localhost:3001'));
    } else if (protocol === 'gRPC') {
      clients.push(new GRPCClient('localhost:50051'));
    } else if (protocol === 'MessageQueue') {
      const client = new MQClient();
      await client.connect(`agent_${i}`, { type: 'benchmark' });
      clients.push(client);
    }
  }
  
  // 并发测试
  const startTime = performance.now();
  
  const promises = clients.map(async (client, idx) => {
    for (let i = 0; i < iterations; i++) {
      const reqStart = performance.now();
      
      if (protocol === 'RESTful') {
        await client.sendMessage(`agent_${idx}`, `agent_${(idx + 1) % concurrency}`, generatePayload(100));
      } else if (protocol === 'gRPC') {
        await client.sendMessage(`agent_${idx}`, `agent_${(idx + 1) % concurrency}`, generatePayload(100));
      } else if (protocol === 'MessageQueue') {
        await client.sendMessage(`agent_${(idx + 1) % concurrency}`, generatePayload(100));
      }
      
      stats.add(performance.now() - reqStart);
    }
  });
  
  await Promise.all(promises);
  
  const totalTime = performance.now() - startTime;
  const results = stats.results;
  
  // 清理
  for (const client of clients) {
    if (protocol === 'gRPC') client.close();
    if (protocol === 'MessageQueue') await client.close();
  }
  
  return {
    protocol,
    concurrency,
    totalTime,
    throughput: ((iterations * concurrency) / totalTime * 1000).toFixed(2),
    ...results
  };
}

// 负载大小测试
async function benchmarkPayloadSize(protocol, payloadSize) {
  console.log(`Testing ${protocol} with ${payloadSize} byte payload...`);
  
  const stats = new Statistics();
  const payload = generatePayload(payloadSize);
  
  let client;
  if (protocol === 'RESTful') {
    client = new RESTClient('http://localhost:3001');
  } else if (protocol === 'gRPC') {
    client = new GRPCClient('localhost:50051');
  } else if (protocol === 'MessageQueue') {
    client = new MQClient();
    await client.connect('benchmark_agent', { type: 'benchmark' });
  }
  
  const iterations = 100;
  
  for (let i = 0; i < iterations; i++) {
    const reqStart = performance.now();
    
    if (protocol === 'RESTful') {
      await client.sendMessage('agent_1', 'agent_2', payload);
    } else if (protocol === 'gRPC') {
      await client.sendMessage('agent_1', 'agent_2', payload);
    } else if (protocol === 'MessageQueue') {
      await client.sendMessage('agent_2', payload);
    }
    
    stats.add(performance.now() - reqStart);
  }
  
  const results = stats.results;
  
  if (protocol === 'gRPC') client.close();
  if (protocol === 'MessageQueue') await client.close();
  
  return {
    protocol,
    payloadSize,
    ...results
  };
}

// 运行所有测试
export async function runAllBenchmarks() {
  const results = {
    singleThreaded: {},
    concurrent: {},
    payloadSize: {}
  };
  
  try {
    // 单线程测试
    console.log('\n=== Single Threaded Benchmarks ===');
    results.singleThreaded.restful = await benchmarkRESTful();
    results.singleThreaded.grpc = await benchmarkGRPC();
    // results.singleThreaded.mq = await benchmarkMQ(); // 需要Redis
    
    // 并发测试
    console.log('\n=== Concurrent Benchmarks ===');
    for (const concurrency of [10, 50]) {
      results.concurrent[`restful_${concurrency}`] = await benchmarkConcurrent('RESTful', concurrency);
      results.concurrent[`grpc_${concurrency}`] = await benchmarkConcurrent('gRPC', concurrency);
    }
    
    // 负载大小测试
    console.log('\n=== Payload Size Benchmarks ===');
    for (const size of CONFIG.payloadSizes) {
      results.payloadSize[`restful_${size}`] = await benchmarkPayloadSize('RESTful', size);
      results.payloadSize[`grpc_${size}`] = await benchmarkPayloadSize('gRPC', size);
    }
    
  } catch (err) {
    console.error('Benchmark error:', err);
  }
  
  return results;
}

// 主函数
async function main() {
  console.log('A2A Protocol Benchmark Tool');
  console.log('===========================\n');
  
  // 启动服务器
  console.log('Starting servers...');
  const restServer = await createRESTServer(3001);
  const grpcServer = await createGRPCServer(50051);
  
  console.log('Servers ready. Starting benchmarks...\n');
  
  // 运行测试
  const results = await runAllBenchmarks();
  
  // 输出结果
  console.log('\n===========================');
  console.log('BENCHMARK RESULTS');
  console.log('===========================\n');
  
  console.log(JSON.stringify(results, null, 2));
  
  // 关闭服务器
  restServer.close();
  grpcServer.forceShutdown();
  
  return results;
}

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(results => {
    console.log('\nBenchmark completed!');
    process.exit(0);
  }).catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}
