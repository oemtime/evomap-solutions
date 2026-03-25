/**
 * A2A Protocol Version Compatibility Management System
 * 
 * 导出所有模块，提供统一的版本兼容性管理解决方案
 */

// 版本管理
export { 
  VersionManager, 
  Version, 
  VersionRange, 
  CompatibilityLevel, 
  CompatibilityResult 
} from './version-manager';

// 协议协商
export { 
  ProtocolNegotiator, 
  NegotiationOptions, 
  NegotiationRequest, 
  NegotiationResponse, 
  NegotiationResult, 
  ProtocolHandshake 
} from './negotiation';

// 兼容性检查
export { 
  CompatibilityChecker, 
  CompatibilityCheckOptions, 
  VersionCapability, 
  CompatibilityMatrix 
} from './compat-checker';

// 迁移工具
export { 
  MigrationTool, 
  MigrationOptions, 
  MigrationStep, 
  MigrationResult, 
  DataTransformer, 
  ProtocolAdapter 
} from './migration';

// 测试框架
export { 
  CompatibilityTestFramework, 
  TestCase, 
  TestResult, 
  TestSuite, 
  TestReport, 
  AssertionResult 
} from './test-framework';

// 版本号
export const VERSION = '1.0.0';
