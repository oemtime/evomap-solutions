/**
 * A2A Protocol Version Compatibility - Usage Example
 * 完整使用示例
 */

import { VersionManager } from './version-manager';
import { CompatibilityChecker } from './compat-checker';
import { ProtocolNegotiator } from './negotiation';
import { MigrationTool } from './migration';
import { CompatibilityTestFramework } from './test-framework';

async function main() {
  console.log('='.repeat(60));
  console.log('A2A 协议版本兼容性管理示例');
  console.log('='.repeat(60));

  // ============================================================
  // 1. 初始化版本管理器
  // ============================================================
  console.log('\n📦 1. 初始化版本管理器');
  const versionManager = new VersionManager('1.2.0');
  
  // 注册支持的版本
  versionManager.registerSupportedVersion('1.0.0');
  versionManager.registerSupportedVersion('1.1.0');
  versionManager.registerSupportedVersion('1.2.0');
  
  console.log(`   当前版本: ${versionManager.getCurrentVersionString()}`);
  console.log(`   支持版本: ${versionManager.getSupportedVersions().join(', ')}`);

  // ============================================================
  // 2. 版本解析和比较
  // ============================================================
  console.log('\n🔍 2. 版本解析和比较');
  const v1 = versionManager.parse('1.2.3');
  console.log(`   解析 1.2.3: major=${v1.major}, minor=${v1.minor}, patch=${v1.patch}`);
  
  const cmp = versionManager.compare('1.2.0', '1.1.0');
  console.log(`   比较 1.2.0 vs 1.1.0: ${cmp > 0 ? '>' : cmp < 0 ? '<' : '='}`);
  
  const satisfies = versionManager.satisfies('1.2.0', '^1.0.0');
  console.log(`   1.2.0 满足 ^1.0.0: ${satisfies}`);

  // ============================================================
  // 3. 注册功能
  // ============================================================
  console.log('\n⚙️  3. 注册功能');
  versionManager.registerFeature('streaming', '1.0.0');
  versionManager.registerFeature('encryption', '1.1.0');
  versionManager.registerFeature('batch-processing', '1.2.0');
  
  console.log(`   streaming 在 1.0.0 可用: ${versionManager.isFeatureAvailable('streaming', '1.0.0')}`);
  console.log(`   encryption 在 1.0.0 可用: ${versionManager.isFeatureAvailable('encryption', '1.0.0')}`);
  console.log(`   batch-processing 在 1.1.0 可用: ${versionManager.isFeatureAvailable('batch-processing', '1.1.0')}`);

  // ============================================================
  // 4. 兼容性检查
  // ============================================================
  console.log('\n✅ 4. 兼容性检查');
  const checker = new CompatibilityChecker(versionManager);
  
  const compat1 = checker.checkCompatibility('1.2.0', '1.1.0');
  console.log(`   1.2.0 vs 1.1.0:`);
  console.log(`     - 兼容级别: ${compat1.level}`);
  console.log(`     - 可通信: ${compat1.canCommunicate}`);
  console.log(`     - 需要降级: ${compat1.requiresDowngrade}`);
  
  const compat2 = checker.checkCompatibility('1.0.0', '2.0.0');
  console.log(`   1.0.0 vs 2.0.0:`);
  console.log(`     - 兼容级别: ${compat2.level}`);
  console.log(`     - 可通信: ${compat2.canCommunicate}`);

  // ============================================================
  // 5. 协议协商
  // ============================================================
  console.log('\n🤝 5. 协议协商');
  const negotiator = new ProtocolNegotiator(versionManager);
  
  const localRequest = {
    version: '1.2.0',
    supportedVersions: ['1.2.0', '1.1.0', '1.0.0'],
    preferredFeatures: ['streaming', 'encryption', 'batch-processing'],
    capabilities: ['fast-handshake']
  };
  
  const remoteResponse = {
    acceptedVersion: '1.1.0',
    rejectedVersions: [],
    supportedFeatures: ['streaming', 'encryption'],
    downgradeRequired: true,
    negotiationId: 'demo-negotiation'
  };
  
  const negotiationResult = await negotiator.negotiate(localRequest, remoteResponse);
  console.log(`   协商结果:`);
  console.log(`     - 成功: ${negotiationResult.success}`);
  console.log(`     - 协议版本: ${negotiationResult.agreedVersion}`);
  console.log(`     - 支持功能: ${negotiationResult.features.join(', ')}`);
  console.log(`     - 限制: ${negotiationResult.limitations.join(', ') || '无'}`);
  
  if (negotiationResult.downgradeInfo) {
    console.log(`     - 降级: ${negotiationResult.downgradeInfo.from} → ${negotiationResult.downgradeInfo.to}`);
  }

  // ============================================================
  // 6. 迁移工具
  // ============================================================
  console.log('\n🔄 6. 迁移工具');
  const migrationTool = new MigrationTool(versionManager, checker);
  
  // 检查迁移可能性
  const canMigrate = migrationTool.canMigrate('1.0.0', '1.2.0');
  console.log(`   从 1.0.0 迁移到 1.2.0:`);
  console.log(`     - 可行: ${canMigrate.possible}`);
  console.log(`     - 原因: ${canMigrate.reason}`);
  console.log(`     - 估计步骤: ${canMigrate.estimatedSteps}`);
  
  // 创建降级适配器
  const downgradeAdapter = migrationTool.createDowngradeAdapter('1.2.0', '1.1.0');
  console.log(`   降级适配器 (1.2.0 → 1.1.0):`);
  console.log(`     - 是否需要: ${downgradeAdapter.isRequired}`);
  
  const testMessage = {
    data: 'test',
    advancedFeatures: { cache: true },
    version: '1.2.0'
  };
  const adaptedMessage = downgradeAdapter.adapt(testMessage);
  console.log(`     - 适配结果:`, JSON.stringify(adaptedMessage));

  // ============================================================
  // 7. 兼容性测试框架
  // ============================================================
  console.log('\n🧪 7. 兼容性测试框架');
  const testFramework = new CompatibilityTestFramework(
    versionManager,
    checker,
    negotiator,
    migrationTool
  );
  
  // 加载默认测试套件
  testFramework.initializeDefaultSuites();
  
  // 运行测试
  console.log('   运行测试套件...');
  const testReport = await testFramework.runAllTests();
  
  console.log(`\n   测试结果:`);
  console.log(`     - 总测试数: ${testReport.totalTests}`);
  console.log(`     - 通过: ${testReport.passed} ✅`);
  console.log(`     - 失败: ${testReport.failed} ❌`);
  console.log(`     - 跳过: ${testReport.skipped} ⏭`);
  console.log(`     - 通过率: ${((testReport.passed / testReport.totalTests) * 100).toFixed(2)}%`);
  console.log(`     - 总耗时: ${testReport.duration}ms`);

  // ============================================================
  // 8. 生成兼容性矩阵
  // ============================================================
  console.log('\n📊 8. 兼容性矩阵');
  const versions = ['1.0.0', '1.1.0', '1.2.0'];
  const matrix = checker.generateCompatibilityMatrix(versions);
  
  console.log('   版本兼容性矩阵:');
  console.log('            1.0.0    1.1.0    1.2.0');
  for (const v1 of versions) {
    let row = `   ${v1}   `;
    for (const v2 of versions) {
      const level = matrix[v1][v2];
      const icon = level === 'full' ? '✓' : level === 'none' ? '✗' : '~';
      row += `${icon.padEnd(9)}`;
    }
    console.log(row);
  }

  // ============================================================
  // 9. 获取兼容性建议
  // ============================================================
  console.log('\n💡 9. 兼容性建议');
  const recommendation = checker.getRecommendation('1.2.0', '1.1.0');
  console.log(`   1.2.0 vs 1.1.0:`);
  console.log(`     - 建议操作: ${recommendation.action}`);
  console.log(`     - 原因: ${recommendation.reason}`);
  console.log(`     - 优先级: ${recommendation.priority}`);

  console.log('\n' + '='.repeat(60));
  console.log('示例完成！');
  console.log('='.repeat(60));
}

// 运行示例
main().catch(console.error);

export default main;
