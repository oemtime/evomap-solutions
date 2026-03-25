/**
 * A2A Compatibility Test Framework
 * 兼容性测试框架 - 验证兼容性实现的正确性
 */

import { VersionManager, Version, CompatibilityLevel } from './version-manager';
import { CompatibilityChecker } from './compat-checker';
import { ProtocolNegotiator, NegotiationResult } from './negotiation';
import { MigrationTool, MigrationResult } from './migration';

export interface TestCase {
  name: string;
  description: string;
  category: 'version' | 'compatibility' | 'negotiation' | 'migration' | 'integration';
  setup?: () => void;
  run: () => Promise<TestResult> | TestResult;
  teardown?: () => void;
  expectedResult?: 'pass' | 'fail' | 'skip';
}

export interface TestResult {
  passed: boolean;
  name: string;
  duration: number;
  assertions: AssertionResult[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface AssertionResult {
  passed: boolean;
  message: string;
  expected?: any;
  actual?: any;
}

export interface TestSuite {
  name: string;
  description: string;
  tests: TestCase[];
  beforeAll?: () => void;
  afterAll?: () => void;
  beforeEach?: () => void;
  afterEach?: () => void;
}

export interface TestReport {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites: {
    name: string;
    results: TestResult[];
  }[];
  timestamp: string;
}

/**
 * 兼容性测试框架类
 */
export class CompatibilityTestFramework {
  private versionManager: VersionManager;
  private compatibilityChecker: CompatibilityChecker;
  private negotiator: ProtocolNegotiator;
  private migrationTool: MigrationTool;
  private suites: TestSuite[] = [];
  private testResults: Map<string, TestResult[]> = new Map();

  constructor(
    versionManager: VersionManager,
    compatibilityChecker: CompatibilityChecker,
    negotiator: ProtocolNegotiator,
    migrationTool: MigrationTool
  ) {
    this.versionManager = versionManager;
    this.compatibilityChecker = compatibilityChecker;
    this.negotiator = negotiator;
    this.migrationTool = migrationTool;
  }

  /**
   * 注册测试套件
   */
  registerSuite(suite: TestSuite): void {
    this.suites.push(suite);
  }

  /**
   * 运行所有测试
   */
  async runAllTests(): Promise<TestReport> {
    const report: TestReport = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      suites: [],
      timestamp: new Date().toISOString()
    };

    const startTime = Date.now();

    for (const suite of this.suites) {
      const suiteResults = await this.runSuite(suite);
      report.suites.push({
        name: suite.name,
        results: suiteResults
      });

      for (const result of suiteResults) {
        report.totalTests++;
        if (result.passed) {
          report.passed++;
        } else {
          report.failed++;
        }
      }
    }

    report.duration = Date.now() - startTime;
    return report;
  }

  /**
   * 运行单个测试套件
   */
  private async runSuite(suite: TestSuite): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // 套件级前置
    if (suite.beforeAll) {
      suite.beforeAll();
    }

    for (const test of suite.tests) {
      // 测试级前置
      if (suite.beforeEach) {
        suite.beforeEach();
      }
      if (test.setup) {
        test.setup();
      }

      const startTime = Date.now();
      try {
        const result = await test.run();
        result.duration = Date.now() - startTime;
        results.push(result);
      } catch (error) {
        results.push({
          passed: false,
          name: test.name,
          duration: Date.now() - startTime,
          assertions: [],
          error: String(error)
        });
      }

      // 测试级后置
      if (test.teardown) {
        test.teardown();
      }
      if (suite.afterEach) {
        suite.afterEach();
      }
    }

    // 套件级后置
    if (suite.afterAll) {
      suite.afterAll();
    }

    return results;
  }

  /**
   * 创建版本管理测试套件
   */
  createVersionTestSuite(): TestSuite {
    return {
      name: 'Version Management',
      description: 'Tests for version parsing, comparison and validation',
      tests: [
        {
          name: 'Parse Semantic Version',
          description: 'Should correctly parse semantic version strings',
          category: 'version',
          run: () => {
            const v1 = this.versionManager.parse('1.2.3');
            const v2 = this.versionManager.parse('v2.0.0-beta.1');
            
            return {
              passed: v1.major === 1 && v1.minor === 2 && v1.patch === 3 &&
                     v2.major === 2 && v2.prerelease?.[0] === 'beta',
              name: 'Parse Semantic Version',
              duration: 0,
              assertions: [
                { passed: v1.major === 1, message: 'Major version parsed correctly' },
                { passed: v1.minor === 2, message: 'Minor version parsed correctly' },
                { passed: v1.patch === 3, message: 'Patch version parsed correctly' },
                { passed: v2.prerelease?.[0] === 'beta', message: 'Prerelease parsed correctly' }
              ]
            };
          }
        },
        {
          name: 'Compare Versions',
          description: 'Should correctly compare version numbers',
          category: 'version',
          run: () => {
            const cmp1 = this.versionManager.compare('1.0.0', '2.0.0');
            const cmp2 = this.versionManager.compare('2.0.0', '1.0.0');
            const cmp3 = this.versionManager.compare('1.0.0', '1.0.0');
            
            return {
              passed: cmp1 === -1 && cmp2 === 1 && cmp3 === 0,
              name: 'Compare Versions',
              duration: 0,
              assertions: [
                { passed: cmp1 === -1, message: '1.0.0 < 2.0.0' },
                { passed: cmp2 === 1, message: '2.0.0 > 1.0.0' },
                { passed: cmp3 === 0, message: '1.0.0 = 1.0.0' }
              ]
            };
          }
        },
        {
          name: 'Satisfy Version Range',
          description: 'Should correctly check version range satisfaction',
          category: 'version',
          run: () => {
            const tests = [
              { ver: '1.2.3', range: '>=1.0.0', expected: true },
              { ver: '1.2.3', range: '<2.0.0', expected: true },
              { ver: '1.2.3', range: '^1.0.0', expected: true },
              { ver: '2.0.0', range: '^1.0.0', expected: false },
              { ver: '1.2.3', range: '~1.2.0', expected: true },
              { ver: '1.3.0', range: '~1.2.0', expected: false }
            ];
            
            const assertions = tests.map(t => ({
              passed: this.versionManager.satisfies(t.ver, t.range) === t.expected,
              message: `${t.ver} satisfies ${t.range}`,
              expected: t.expected,
              actual: this.versionManager.satisfies(t.ver, t.range)
            }));
            
            return {
              passed: assertions.every(a => a.passed),
              name: 'Satisfy Version Range',
              duration: 0,
              assertions
            };
          }
        }
      ]
    };
  }

  /**
   * 创建兼容性测试套件
   */
  createCompatibilityTestSuite(): TestSuite {
    return {
      name: 'Compatibility Checking',
      description: 'Tests for version compatibility detection',
      tests: [
        {
          name: 'Same Version Compatibility',
          description: 'Same versions should be fully compatible',
          category: 'compatibility',
          run: () => {
            const result = this.compatibilityChecker.checkCompatibility('1.0.0', '1.0.0');
            return {
              passed: result.level === CompatibilityLevel.FULL && result.canCommunicate,
              name: 'Same Version Compatibility',
              duration: 0,
              assertions: [
                { 
                  passed: result.level === CompatibilityLevel.FULL, 
                  message: 'Same version has full compatibility',
                  expected: CompatibilityLevel.FULL,
                  actual: result.level
                },
                { passed: result.canCommunicate, message: 'Can communicate' },
                { passed: !result.requiresDowngrade, message: 'No downgrade required' }
              ]
            };
          }
        },
        {
          name: 'Backward Compatibility',
          description: 'Newer version should be backward compatible with older',
          category: 'compatibility',
          run: () => {
            const result = this.compatibilityChecker.checkCompatibility('1.2.0', '1.1.0');
            return {
              passed: result.level === CompatibilityLevel.BACKWARD && 
                     result.requiresDowngrade,
              name: 'Backward Compatibility',
              duration: 0,
              assertions: [
                { passed: result.canCommunicate, message: 'Can communicate' },
                { passed: result.requiresDowngrade, message: 'Requires downgrade' },
                { passed: result.targetVersion === '1.1.0', message: 'Target version is older' }
              ]
            };
          }
        },
        {
          name: 'Forward Compatibility',
          description: 'Older version should be forward compatible with newer',
          category: 'compatibility',
          run: () => {
            const result = this.compatibilityChecker.checkCompatibility('1.1.0', '1.2.0');
            return {
              passed: result.level === CompatibilityLevel.FORWARD && 
                     !result.requiresDowngrade,
              name: 'Forward Compatibility',
              duration: 0,
              assertions: [
                { passed: result.canCommunicate, message: 'Can communicate' },
                { passed: !result.requiresDowngrade, message: 'No downgrade required' }
              ]
            };
          }
        },
        {
          name: 'Incompatible Versions',
          description: 'Different major versions should be incompatible',
          category: 'compatibility',
          run: () => {
            const result = this.compatibilityChecker.checkCompatibility('1.0.0', '2.0.0');
            return {
              passed: result.level === CompatibilityLevel.NONE && 
                     !result.canCommunicate,
              name: 'Incompatible Versions',
              duration: 0,
              assertions: [
                { passed: result.level === CompatibilityLevel.NONE, message: 'No compatibility' },
                { passed: !result.canCommunicate, message: 'Cannot communicate' }
              ]
            };
          }
        }
      ]
    };
  }

  /**
   * 创建协议协商测试套件
   */
  createNegotiationTestSuite(): TestSuite {
    return {
      name: 'Protocol Negotiation',
      description: 'Tests for protocol negotiation between agents',
      tests: [
        {
          name: 'Negotiate Same Version',
          description: 'Should agree when versions are identical',
          category: 'negotiation',
          run: async () => {
            const request = {
              version: '1.0.0',
              supportedVersions: ['1.0.0'],
              preferredFeatures: [],
              capabilities: []
            };
            
            const response = {
              acceptedVersion: '1.0.0',
              rejectedVersions: [],
              supportedFeatures: [],
              downgradeRequired: false,
              negotiationId: 'test-1'
            };
            
            const result = await this.negotiator.negotiate(request, response);
            
            return {
              passed: result.success && result.agreedVersion === '1.0.0',
              name: 'Negotiate Same Version',
              duration: 0,
              assertions: [
                { passed: result.success, message: 'Negotiation succeeded' },
                { passed: result.agreedVersion === '1.0.0', message: 'Agreed on correct version' }
              ]
            };
          }
        },
        {
          name: 'Negotiate With Downgrade',
          description: 'Should downgrade when local version is newer',
          category: 'negotiation',
          run: async () => {
            const request = {
              version: '1.2.0',
              supportedVersions: ['1.2.0', '1.1.0', '1.0.0'],
              preferredFeatures: [],
              capabilities: []
            };
            
            const response = {
              acceptedVersion: '1.1.0',
              rejectedVersions: [],
              supportedFeatures: [],
              downgradeRequired: true,
              negotiationId: 'test-2'
            };
            
            const result = await this.negotiator.negotiate(request, response);
            
            return {
              passed: result.success && result.agreedVersion === '1.1.0',
              name: 'Negotiate With Downgrade',
              duration: 0,
              assertions: [
                { passed: result.success, message: 'Negotiation succeeded' },
                { passed: result.agreedVersion === '1.1.0', message: 'Downgraded to compatible version' },
                { passed: !!result.downgradeInfo, message: 'Downgrade info provided' }
              ]
            };
          }
        }
      ]
    };
  }

  /**
   * 创建迁移测试套件
   */
  createMigrationTestSuite(): TestSuite {
    return {
      name: 'Data Migration',
      description: 'Tests for version data migration',
      tests: [
        {
          name: 'Can Migrate Compatible Versions',
          description: 'Should detect migratable versions',
          category: 'migration',
          run: () => {
            const result = this.migrationTool.canMigrate('1.0.0', '1.1.0');
            
            return {
              passed: result.possible,
              name: 'Can Migrate Compatible Versions',
              duration: 0,
              assertions: [
                { passed: result.possible, message: 'Migration is possible' },
                { passed: result.estimatedSteps > 0, message: 'Has migration steps' }
              ]
            };
          }
        },
        {
          name: 'Cannot Migrate Incompatible Versions',
          description: 'Should reject migration between major versions',
          category: 'migration',
          run: () => {
            const result = this.migrationTool.canMigrate('1.0.0', '2.0.0');
            
            return {
              passed: !result.possible,
              name: 'Cannot Migrate Incompatible Versions',
              duration: 0,
              assertions: [
                { passed: !result.possible, message: 'Migration is not possible' }
              ]
            };
          }
        }
      ]
    };
  }

  /**
   * 创建集成测试套件
   */
  createIntegrationTestSuite(): TestSuite {
    return {
      name: 'Integration Tests',
      description: 'End-to-end integration tests',
      tests: [
        {
          name: 'Full Negotiation Flow',
          description: 'Complete negotiation between two agents',
          category: 'integration',
          run: async () => {
            const assertions: AssertionResult[] = [];
            
            // 模拟两个Agent的协商
            const agent1Version = '1.2.0';
            const agent2Version = '1.1.0';
            
            // 检查兼容性
            const compat = this.compatibilityChecker.checkCompatibility(
              agent1Version, 
              agent2Version
            );
            assertions.push({
              passed: compat.canCommunicate,
              message: 'Agents can communicate'
            });
            
            // 执行协商
            const request = {
              version: agent1Version,
              supportedVersions: [agent1Version, agent2Version],
              preferredFeatures: ['streaming', 'encryption'],
              capabilities: ['fast-handshake']
            };
            
            const response = {
              acceptedVersion: agent2Version,
              rejectedVersions: [],
              supportedFeatures: ['streaming'],
              downgradeRequired: true,
              negotiationId: 'integration-test'
            };
            
            const result = await this.negotiator.negotiate(request, response);
            assertions.push({
              passed: result.success,
              message: 'Negotiation succeeded'
            });
            assertions.push({
              passed: result.agreedVersion === agent2Version,
              message: 'Agreed on lower version'
            });
            
            return {
              passed: assertions.every(a => a.passed),
              name: 'Full Negotiation Flow',
              duration: 0,
              assertions
            };
          }
        }
      ]
    };
  }

  /**
   * 生成测试报告
   */
  generateReport(report: TestReport): string {
    let output = `# A2A 兼容性测试报告\n\n`;
    output += `生成时间: ${report.timestamp}\n`;
    output += `总耗时: ${report.duration}ms\n\n`;
    output += `## 摘要\n\n`;
    output += `- 总测试数: ${report.totalTests}\n`;
    output += `- 通过: ${report.passed} ✅\n`;
    output += `- 失败: ${report.failed} ❌\n`;
    output += `- 跳过: ${report.skipped} ⏭\n`;
    output += `- 通过率: ${((report.passed / report.totalTests) * 100).toFixed(2)}%\n\n`;

    for (const suite of report.suites) {
      output += `## ${suite.name}\n\n`;
      
      for (const result of suite.results) {
        const icon = result.passed ? '✅' : '❌';
        output += `### ${icon} ${result.name}\n`;
        output += `耗时: ${result.duration}ms\n\n`;
        
        for (const assertion of result.assertions) {
          const aIcon = assertion.passed ? '✓' : '✗';
          output += `- ${aIcon} ${assertion.message}\n`;
        }
        
        if (result.error) {
          output += `\n**错误:** ${result.error}\n`;
        }
        
        output += `\n`;
      }
    }

    return output;
  }

  /**
   * 初始化默认测试套件
   */
  initializeDefaultSuites(): void {
    this.registerSuite(this.createVersionTestSuite());
    this.registerSuite(this.createCompatibilityTestSuite());
    this.registerSuite(this.createNegotiationTestSuite());
    this.registerSuite(this.createMigrationTestSuite());
    this.registerSuite(this.createIntegrationTestSuite());
  }
}

export default CompatibilityTestFramework;
