/**
 * 基准测试运行器入口
 */

import { runAllBenchmarks } from './runner.js';

async function main() {
  console.log('A2A Protocol Benchmark Suite');
  console.log('=============================\n');
  
  const results = await runAllBenchmarks();
  
  console.log('\n=============================');
  console.log('Results Summary');
  console.log('=============================');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
