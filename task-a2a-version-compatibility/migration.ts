/**
 * A2A Migration Tool
 * 迁移工具 - 提供协议降级和升级功能
 */

import { VersionManager, Version } from './version-manager';
import { CompatibilityChecker } from './compat-checker';

export interface MigrationOptions {
  backupData: boolean;
  validateAfter: boolean;
  rollbackOnError: boolean;
  dryRun: boolean;
}

export interface MigrationStep {
  type: 'upgrade' | 'downgrade' | 'transform' | 'validate';
  description: string;
  from: string;
  to: string;
  transform?: (data: any) => any;
}

export interface MigrationResult {
  success: boolean;
  from: string;
  to: string;
  steps: MigrationStep[];
  dataMigrations: string[];
  errors: string[];
  warnings: string[];
  backupLocation?: string;
}

export interface DataTransformer {
  versionRange: { min: string; max: string };
  transform: (data: any, fromVersion: string, toVersion: string) => any;
  rollback: (data: any, fromVersion: string, toVersion: string) => any;
}

export interface ProtocolAdapter {
  fromVersion: string;
  toVersion: string;
  adaptRequest: (request: any) => any;
  adaptResponse: (response: any) => any;
}

/**
 * 迁移工具类
 */
export class MigrationTool {
  private versionManager: VersionManager;
  private compatibilityChecker: CompatibilityChecker;
  private dataTransformers: Map<string, DataTransformer[]> = new Map();
  private protocolAdapters: Map<string, ProtocolAdapter> = new Map();
  private migrationHistory: MigrationResult[] = [];

  constructor(
    versionManager: VersionManager,
    compatibilityChecker: CompatibilityChecker
  ) {
    this.versionManager = versionManager;
    this.compatibilityChecker = compatibilityChecker;
  }

  /**
   * 注册数据转换器
   */
  registerDataTransformer(transformer: DataTransformer): void {
    const key = `${transformer.versionRange.min}-${transformer.versionRange.max}`;
    if (!this.dataTransformers.has(key)) {
      this.dataTransformers.set(key, []);
    }
    this.dataTransformers.get(key)!.push(transformer);
  }

  /**
   * 注册协议适配器
   */
  registerProtocolAdapter(adapter: ProtocolAdapter): void {
    const key = `${adapter.fromVersion}-${adapter.toVersion}`;
    this.protocolAdapters.set(key, adapter);
  }

  /**
   * 执行版本迁移
   */
  async migrate(
    fromVersion: string,
    toVersion: string,
    data?: any,
    options: Partial<MigrationOptions> = {}
  ): Promise<MigrationResult> {
    const opts: MigrationOptions = {
      backupData: true,
      validateAfter: true,
      rollbackOnError: true,
      dryRun: false,
      ...options
    };

    const result: MigrationResult = {
      success: false,
      from: fromVersion,
      to: toVersion,
      steps: [],
      dataMigrations: [],
      errors: [],
      warnings: []
    };

    try {
      // 验证迁移路径
      const pathValidation = this.compatibilityChecker.validateUpgradePath(
        fromVersion, 
        toVersion
      );

      if (!pathValidation.valid) {
        result.errors.push(...pathValidation.breakingChanges);
        return result;
      }

      // 备份数据
      if (opts.backupData && data) {
        result.backupLocation = await this.backupData(data, fromVersion);
        result.steps.push({
          type: 'validate',
          description: `Backed up data to ${result.backupLocation}`,
          from: fromVersion,
          to: toVersion
        });
      }

      // 生成迁移步骤
      const steps = this.generateMigrationSteps(fromVersion, toVersion);
      result.steps.push(...steps);

      if (opts.dryRun) {
        result.warnings.push('Dry run mode - no actual changes made');
        result.success = true;
        return result;
      }

      // 执行迁移
      let migratedData = data;
      for (const step of steps) {
        if (step.type === 'transform' && step.transform) {
          migratedData = step.transform(migratedData);
          result.dataMigrations.push(step.description);
        }
      }

      // 验证迁移结果
      if (opts.validateAfter) {
        const validationResult = this.validateMigration(
          fromVersion, 
          toVersion, 
          migratedData
        );
        if (!validationResult.valid) {
          result.errors.push(...validationResult.errors);
          if (opts.rollbackOnError && result.backupLocation) {
            await this.rollback(result.backupLocation);
            result.warnings.push('Rolled back to previous state');
          }
          return result;
        }
      }

      result.success = true;
      this.migrationHistory.push(result);

      return result;

    } catch (error) {
      result.errors.push(`Migration failed: ${error}`);
      if (opts.rollbackOnError && result.backupLocation) {
        await this.rollback(result.backupLocation);
        result.warnings.push('Rolled back to previous state');
      }
      return result;
    }
  }

  /**
   * 生成迁移步骤
   */
  private generateMigrationSteps(fromVersion: string, toVersion: string): MigrationStep[] {
    const steps: MigrationStep[] = [];
    const from = this.versionManager.parse(fromVersion);
    const to = this.versionManager.parse(toVersion);

    const comparison = this.versionManager.compare(fromVersion, toVersion);

    if (comparison === 0) {
      steps.push({
        type: 'validate',
        description: 'Source and target versions are identical',
        from: fromVersion,
        to: toVersion
      });
      return steps;
    }

    const isUpgrade = comparison < 0;
    const type: 'upgrade' | 'downgrade' = isUpgrade ? 'upgrade' : 'downgrade';

    // 主版本迁移
    if (from.major !== to.major) {
      steps.push({
        type,
        description: `Migrate major version: ${from.major} → ${to.major}`,
        from: fromVersion,
        to: toVersion
      });
    }

    // 次版本迁移
    if (from.minor !== to.minor) {
      steps.push({
        type,
        description: `Migrate minor version: ${from.minor} → ${to.minor}`,
        from: fromVersion,
        to: toVersion
      });
    }

    // 修订号迁移
    if (from.patch !== to.patch) {
      steps.push({
        type,
        description: `Apply patch changes: ${from.patch} → ${to.patch}`,
        from: fromVersion,
        to: toVersion
      });
    }

    // 数据转换步骤
    const transformers = this.findDataTransformers(fromVersion, toVersion);
    for (const transformer of transformers) {
      steps.push({
        type: 'transform',
        description: `Transform data for ${transformer.versionRange.min} to ${transformer.versionRange.max}`,
        from: fromVersion,
        to: toVersion,
        transform: (data) => transformer.transform(data, fromVersion, toVersion)
      });
    }

    // 验证步骤
    steps.push({
      type: 'validate',
      description: 'Validate migration result',
      from: fromVersion,
      to: toVersion
    });

    return steps;
  }

  /**
   * 查找适用的数据转换器
   */
  private findDataTransformers(fromVersion: string, toVersion: string): DataTransformer[] {
    const result: DataTransformer[] = [];
    
    for (const [, transformers] of this.dataTransformers) {
      for (const transformer of transformers) {
        const fromInRange = this.versionManager.compare(
          fromVersion, 
          transformer.versionRange.min
        ) >= 0;
        const toInRange = this.versionManager.compare(
          toVersion, 
          transformer.versionRange.max
        ) <= 0;
        
        if (fromInRange && toInRange) {
          result.push(transformer);
        }
      }
    }

    return result;
  }

  /**
   * 备份数据
   */
  private async backupData(data: any, version: string): Promise<string> {
    const backupId = `backup-${Date.now()}-${version}`;
    // 实际实现中，这里会将数据持久化到存储
    return backupId;
  }

  /**
   * 回滚迁移
   */
  private async rollback(backupLocation: string): Promise<void> {
    // 实际实现中，这里会从备份恢复数据
    console.log(`Rolling back from ${backupLocation}`);
  }

  /**
   * 验证迁移
   */
  private validateMigration(
    fromVersion: string, 
    toVersion: string, 
    data: any
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 基本验证
    if (!data) {
      errors.push('Migration resulted in null data');
      return { valid: false, errors };
    }

    // 版本兼容性验证
    const compatibility = this.compatibilityChecker.checkCompatibility(
      fromVersion, 
      toVersion
    );

    if (!compatibility.canCommunicate) {
      errors.push('Versions are incompatible after migration');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 适配协议请求
   */
  adaptRequest(request: any, fromVersion: string, toVersion: string): any {
    const adapter = this.findProtocolAdapter(fromVersion, toVersion);
    if (adapter) {
      return adapter.adaptRequest(request);
    }
    return request;
  }

  /**
   * 适配协议响应
   */
  adaptResponse(response: any, fromVersion: string, toVersion: string): any {
    const adapter = this.findProtocolAdapter(fromVersion, toVersion);
    if (adapter) {
      return adapter.adaptResponse(response);
    }
    return response;
  }

  /**
   * 查找协议适配器
   */
  private findProtocolAdapter(fromVersion: string, toVersion: string): ProtocolAdapter | undefined {
    // 尝试精确匹配
    const exactKey = `${fromVersion}-${toVersion}`;
    if (this.protocolAdapters.has(exactKey)) {
      return this.protocolAdapters.get(exactKey);
    }

    // 尝试通配符匹配
    for (const [key, adapter] of this.protocolAdapters) {
      const [adapterFrom, adapterTo] = key.split('-');
      
      const fromMatch = adapterFrom === '*' || 
        this.versionManager.satisfies(fromVersion, adapterFrom);
      const toMatch = adapterTo === '*' || 
        this.versionManager.satisfies(toVersion, adapterTo);
      
      if (fromMatch && toMatch) {
        return adapter;
      }
    }

    return undefined;
  }

  /**
   * 获取迁移历史
   */
  getMigrationHistory(): MigrationResult[] {
    return [...this.migrationHistory];
  }

  /**
   * 检查是否可以迁移
   */
  canMigrate(fromVersion: string, toVersion: string): {
    possible: boolean;
    reason: string;
    estimatedSteps: number;
  } {
    const validation = this.compatibilityChecker.validateUpgradePath(
      fromVersion, 
      toVersion
    );

    if (!validation.valid) {
      return {
        possible: false,
        reason: validation.breakingChanges[0] || 'Invalid migration path',
        estimatedSteps: 0
      };
    }

    const steps = this.generateMigrationSteps(fromVersion, toVersion);
    
    return {
      possible: true,
      reason: 'Migration path is valid',
      estimatedSteps: steps.length
    };
  }

  /**
   * 创建降级适配器
   */
  createDowngradeAdapter(fromVersion: string, toVersion: string): {
    adapt: (message: any) => any;
    isRequired: boolean;
  } {
    const comparison = this.versionManager.compare(fromVersion, toVersion);
    
    if (comparison <= 0) {
      return {
        adapt: (msg) => msg,
        isRequired: false
      };
    }

    return {
      adapt: (message: any) => {
        // 移除新版本特有的字段
        const adapted = { ...message };
        
        // 根据版本差异进行适配
        const diff = this.versionManager.getVersionDiff(fromVersion, toVersion);
        
        if (diff.type === 'minor' || diff.type === 'major') {
          // 移除高级功能相关的字段
          delete adapted.advancedFeatures;
          delete adapted.optimizations;
        }

        return adapted;
      },
      isRequired: true
    };
  }

  /**
   * 创建升级适配器
   */
  createUpgradeAdapter(fromVersion: string, toVersion: string): {
    adapt: (message: any) => any;
    isRequired: boolean;
  } {
    const comparison = this.versionManager.compare(fromVersion, toVersion);
    
    if (comparison >= 0) {
      return {
        adapt: (msg) => msg,
        isRequired: false
      };
    }

    return {
      adapt: (message: any) => {
        // 添加新版本的默认字段
        return {
          ...message,
          version: toVersion,
          migratedFrom: fromVersion,
          timestamp: Date.now()
        };
      },
      isRequired: true
    };
  }
}

export default MigrationTool;
