# A2A 协议版本迁移指南

## 概述

本文档提供了在不同A2A协议版本之间迁移的详细指南，包括升级和降级的最佳实践。

## 版本兼容性规则

### 主版本号（Major）
- **不兼容**：不同主版本号的Agent无法直接通信
- **需要迁移**：需要进行协议适配或数据转换

### 次版本号（Minor）
- **向后兼容**：新版本的Agent可以与旧版本通信
- **可能需要降级**：新功能在旧版本中不可用

### 修订号（Patch）
- **完全兼容**：仅bug修复，不影响功能
- **自动适配**：无需特别处理

## 升级策略

### 1. 准备阶段

```typescript
// 检查当前版本
const currentVersion = versionManager.getCurrentVersionString();

// 验证升级路径
const validation = compatibilityChecker.validateUpgradePath(
  currentVersion, 
  targetVersion
);

if (!validation.valid) {
  console.error('升级路径无效:', validation.errors);
  return;
}

console.log('升级步骤:', validation.steps);
console.log('破坏性变更:', validation.breakingChanges);
```

### 2. 数据备份

```typescript
// 创建降级适配器（以防需要回滚）
const downgradeAdapter = migrationTool.createDowngradeAdapter(
  targetVersion, 
  currentVersion
);

// 执行迁移（带备份）
const result = await migrationTool.migrate(
  currentVersion,
  targetVersion,
  currentData,
  {
    backupData: true,
    validateAfter: true,
    rollbackOnError: true
  }
);

if (!result.success) {
  console.error('迁移失败:', result.errors);
  console.log('已自动回滚到:', result.from);
}
```

### 3. 功能适配

```typescript
// 注册功能适配器
migrationTool.registerProtocolAdapter({
  fromVersion: '1.x.x',
  toVersion: '2.x.x',
  adaptRequest: (request) => {
    // 转换请求格式
    return {
      ...request,
      version: '2.0.0',
      newField: request.oldField
    };
  },
  adaptResponse: (response) => {
    // 转换响应格式
    return response;
  }
});
```

## 降级策略

### 1. 自动降级（协议协商）

```typescript
// 发起协商
const request = {
  version: '1.2.0',
  supportedVersions: ['1.2.0', '1.1.0', '1.0.0'],
  preferredFeatures: ['streaming', 'encryption'],
  capabilities: ['fast-handshake']
};

const result = await negotiator.negotiate(request, remoteResponse);

if (result.downgradeInfo) {
  console.log('降级到版本:', result.downgradeInfo.to);
  console.log('不可用功能:', result.downgradeInfo.deprecatedFeatures);
}
```

### 2. 手动降级

```typescript
// 检查兼容性
const compat = compatibilityChecker.checkCompatibility('1.2.0', '1.1.0');

if (compat.requiresDowngrade) {
  // 创建降级适配器
  const adapter = migrationTool.createDowngradeAdapter('1.2.0', '1.1.0');
  
  // 适配消息
  const adaptedMessage = adapter.adapt(message);
}
```

## 数据转换

### 注册数据转换器

```typescript
migrationTool.registerDataTransformer({
  versionRange: { min: '1.0.0', max: '1.5.0' },
  transform: (data, fromVersion, toVersion) => {
    // 执行数据转换
    return {
      ...data,
      migrated: true,
      version: toVersion
    };
  },
  rollback: (data, fromVersion, toVersion) => {
    // 执行回滚
    return {
      ...data,
      version: fromVersion
    };
  }
});
```

## 测试策略

### 1. 运行兼容性测试

```typescript
// 初始化测试框架
const testFramework = new CompatibilityTestFramework(
  versionManager,
  compatibilityChecker,
  negotiator,
  migrationTool
);

// 加载默认测试套件
testFramework.initializeDefaultSuites();

// 运行所有测试
const report = await testFramework.runAllTests();

// 生成报告
console.log(testFramework.generateReport(report));
```

### 2. 自定义测试用例

```typescript
testFramework.registerSuite({
  name: 'My Custom Tests',
  description: 'Custom migration tests',
  tests: [
    {
      name: 'Test My Migration',
      category: 'migration',
      run: async () => {
        const result = await migrationTool.migrate('1.0.0', '1.1.0', testData);
        return {
          passed: result.success,
          name: 'Test My Migration',
          duration: 0,
          assertions: [
            { passed: result.success, message: 'Migration succeeded' }
          ]
        };
      }
    }
  ]
});
```

## 常见问题

### Q: 如何处理无法降级的功能？

A: 在降级时，新功能相关的字段会被自动移除。建议在应用层实现功能检测：

```typescript
if (compatibilityChecker.isFeatureAvailable('streaming', agreedVersion)) {
  // 使用流式传输
} else {
  // 使用轮询替代
}
```

### Q: 迁移失败如何恢复？

A: 迁移工具默认会备份数据并支持自动回滚：

```typescript
const result = await migrationTool.migrate(from, to, data, {
  backupData: true,
  rollbackOnError: true
});

if (!result.success && result.backupLocation) {
  await migrationTool.rollback(result.backupLocation);
}
```

### Q: 如何处理跨主版本的通信？

A: 跨主版本不兼容，需要通过网关或适配层：

```typescript
// 检查兼容性
const compat = compatibilityChecker.checkCompatibility('1.0.0', '2.0.0');

if (compat.level === CompatibilityLevel.NONE) {
  // 使用网关进行协议转换
  const gatewayAdapter = createGatewayAdapter('1.0.0', '2.0.0');
  const convertedMessage = gatewayAdapter.convert(message);
}
```

## 最佳实践

1. **始终备份数据**：迁移前确保数据已备份
2. **渐进式升级**：优先升级到相邻版本，而非跨版本
3. **测试验证**：在测试环境充分验证后再上生产
4. **监控降级**：记录降级事件和功能限制
5. **版本注册**：及时注册新版本和废弃功能

## 版本弃用流程

1. 标记功能为废弃（deprecated）
2. 提供一个版本周期的过渡期
3. 在下一个主版本中移除
4. 提供迁移工具和文档

```typescript
// 注册废弃功能
compatibilityChecker.registerCapability({
  version: '1.5.0',
  features: ['new-api'],
  deprecated: ['old-api'],
  breaking: []
});
```
