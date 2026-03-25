/**
 * A2A Compatibility Checker
 * 兼容性检查器 - 验证Agent版本间的兼容性状态
 */

import { 
  VersionManager, 
  Version, 
  CompatibilityLevel, 
  CompatibilityResult 
} from './version-manager';

export interface CompatibilityCheckOptions {
  strictMode: boolean;
  allowPrerelease: boolean;
  ignorePatch: boolean;
  featureCheck: boolean;
}

export interface VersionCapability {
  version: string;
  features: string[];
  deprecated: string[];
  breaking: string[];
}

export interface CompatibilityMatrix {
  [version: string]: {
    [version: string]: CompatibilityLevel;
  };
}

/**
 * 兼容性检查器类
 */
export class CompatibilityChecker {
  private versionManager: VersionManager;
  private options: CompatibilityCheckOptions;
  private capabilityRegistry: Map<string, VersionCapability> = new Map();
  private compatibilityCache: Map<string, CompatibilityResult> = new Map();

  constructor(
    versionManager: VersionManager,
    options: Partial<CompatibilityCheckOptions> = {}
  ) {
    this.versionManager = versionManager;
    this.options = {
      strictMode: false,
      allowPrerelease: false,
      ignorePatch: false,
      featureCheck: true,
      ...options
    };
  }

  /**
   * 检查两个版本的兼容性
   */
  checkCompatibility(
    localVersion: string,
    remoteVersion: string
  ): CompatibilityResult {
    const cacheKey = `${localVersion}:${remoteVersion}`;
    
    // 检查缓存
    if (this.compatibilityCache.has(cacheKey)) {
      return this.compatibilityCache.get(cacheKey)!;
    }

    const local = this.versionManager.parse(localVersion);
    const remote = this.versionManager.parse(remoteVersion);

    // 预发布版本检查
    if (!this.options.allowPrerelease) {
      if (local.prerelease || remote.prerelease) {
        const result: CompatibilityResult = {
          level: CompatibilityLevel.PARTIAL,
          canCommunicate: true,
          requiresDowngrade: false,
          features: {
            supported: [],
            unsupported: [],
            deprecated: ['prerelease-versions']
          }
        };
        this.compatibilityCache.set(cacheKey, result);
        return result;
      }
    }

    // 主版本号检查
    if (local.major !== remote.major) {
      const result: CompatibilityResult = {
        level: CompatibilityLevel.NONE,
        canCommunicate: false,
        requiresDowngrade: false,
        features: {
          supported: [],
          unsupported: ['all'],
          deprecated: []
        }
      };
      this.compatibilityCache.set(cacheKey, result);
      return result;
    }

    // 版本比较
    const comparison = this.versionManager.compare(localVersion, remoteVersion);
    
    let level: CompatibilityLevel;
    let requiresDowngrade: boolean;
    let targetVersion: string | undefined;

    if (comparison === 0) {
      // 相同版本
      level = CompatibilityLevel.FULL;
      requiresDowngrade = false;
    } else if (comparison > 0) {
      // 本地版本更新
      if (local.minor === remote.minor) {
        // 只相差修订号
        level = CompatibilityLevel.FULL;
        requiresDowngrade = false;
      } else {
        // 次版本不同
        level = CompatibilityLevel.BACKWARD;
        requiresDowngrade = true;
        targetVersion = remoteVersion;
      }
    } else {
      // 远程版本更新
      if (local.minor === remote.minor) {
        level = CompatibilityLevel.FULL;
        requiresDowngrade = false;
      } else {
        level = CompatibilityLevel.FORWARD;
        requiresDowngrade = false;
      }
    }

    // 功能兼容性检查
    const features = this.checkFeatureCompatibility(localVersion, remoteVersion);

    // 严格模式检查
    if (this.options.strictMode && level !== CompatibilityLevel.FULL) {
      level = CompatibilityLevel.PARTIAL;
    }

    const result: CompatibilityResult = {
      level,
      canCommunicate: level !== CompatibilityLevel.NONE,
      requiresDowngrade,
      targetVersion,
      features
    };

    this.compatibilityCache.set(cacheKey, result);
    return result;
  }

  /**
   * 检查功能兼容性
   */
  private checkFeatureCompatibility(
    localVersion: string,
    remoteVersion: string
  ): {
    supported: string[];
    unsupported: string[];
    deprecated: string[];
  } {
    const supported: string[] = [];
    const unsupported: string[] = [];
    const deprecated: string[] = [];

    const localCapability = this.capabilityRegistry.get(localVersion);
    const remoteCapability = this.capabilityRegistry.get(remoteVersion);

    if (!localCapability || !remoteCapability) {
      return { supported: [], unsupported: [], deprecated: [] };
    }

    // 检查所有已知功能
    const allFeatures = new Set([
      ...localCapability.features,
      ...remoteCapability.features
    ]);

    for (const feature of allFeatures) {
      const localHas = localCapability.features.includes(feature);
      const remoteHas = remoteCapability.features.includes(feature);
      const isDeprecated = localCapability.deprecated.includes(feature) ||
                          remoteCapability.deprecated.includes(feature);

      if (localHas && remoteHas) {
        if (isDeprecated) {
          deprecated.push(feature);
        } else {
          supported.push(feature);
        }
      } else {
        unsupported.push(feature);
      }
    }

    return { supported, unsupported, deprecated };
  }

  /**
   * 批量检查兼容性
   */
  checkBatchCompatibility(
    localVersion: string,
    remoteVersions: string[]
  ): Map<string, CompatibilityResult> {
    const results = new Map<string, CompatibilityResult>();
    
    for (const remoteVersion of remoteVersions) {
      const result = this.checkCompatibility(localVersion, remoteVersion);
      results.set(remoteVersion, result);
    }

    return results;
  }

  /**
   * 生成兼容性矩阵
   */
  generateCompatibilityMatrix(versions: string[]): CompatibilityMatrix {
    const matrix: CompatibilityMatrix = {};

    for (const v1 of versions) {
      matrix[v1] = {};
      for (const v2 of versions) {
        const result = this.checkCompatibility(v1, v2);
        matrix[v1][v2] = result.level;
      }
    }

    return matrix;
  }

  /**
   * 注册版本功能
   */
  registerCapability(capability: VersionCapability): void {
    this.capabilityRegistry.set(capability.version, capability);
  }

  /**
   * 获取版本功能
   */
  getCapability(version: string): VersionCapability | undefined {
    return this.capabilityRegistry.get(version);
  }

  /**
   * 检查是否可以通信
   */
  canCommunicate(localVersion: string, remoteVersion: string): boolean {
    const result = this.checkCompatibility(localVersion, remoteVersion);
    return result.canCommunicate;
  }

  /**
   * 获取建议的操作
   */
  getRecommendation(
    localVersion: string,
    remoteVersion: string
  ): {
    action: 'upgrade' | 'downgrade' | 'none' | 'incompatible';
    reason: string;
    priority: 'high' | 'medium' | 'low';
  } {
    const result = this.checkCompatibility(localVersion, remoteVersion);

    switch (result.level) {
      case CompatibilityLevel.FULL:
        return {
          action: 'none',
          reason: 'Versions are fully compatible',
          priority: 'low'
        };

      case CompatibilityLevel.BACKWARD:
        return {
          action: 'downgrade',
          reason: `Local version (${localVersion}) is newer than remote (${remoteVersion}). Consider downgrading for full compatibility.`,
          priority: 'medium'
        };

      case CompatibilityLevel.FORWARD:
        return {
          action: 'upgrade',
          reason: `Remote version (${remoteVersion}) is newer. Consider upgrading for full compatibility.`,
          priority: 'medium'
        };

      case CompatibilityLevel.PARTIAL:
        return {
          action: 'none',
          reason: 'Partial compatibility. Some features may not work correctly.',
          priority: 'high'
        };

      case CompatibilityLevel.NONE:
        return {
          action: 'incompatible',
          reason: 'Major version mismatch. Cannot communicate.',
          priority: 'high'
        };

      default:
        return {
          action: 'none',
          reason: 'Unknown compatibility status',
          priority: 'low'
        };
    }
  }

  /**
   * 获取兼容版本列表
   */
  getCompatibleVersions(
    referenceVersion: string,
    candidateVersions: string[]
  ): string[] {
    return candidateVersions.filter(version => 
      this.canCommunicate(referenceVersion, version)
    );
  }

  /**
   * 获取最佳匹配版本
   */
  getBestMatch(
    referenceVersion: string,
    candidateVersions: string[]
  ): string | null {
    const compatibleVersions = this.getCompatibleVersions(
      referenceVersion, 
      candidateVersions
    );

    if (compatibleVersions.length === 0) {
      return null;
    }

    // 选择与参考版本最接近的
    return compatibleVersions.sort((a, b) => {
      const diffA = this.versionManager.getVersionDiff(referenceVersion, a);
      const diffB = this.versionManager.getVersionDiff(referenceVersion, b);
      
      // 优先选择patch差异小的
      if (diffA.type === 'patch' && diffB.type !== 'patch') return -1;
      if (diffB.type === 'patch' && diffA.type !== 'patch') return 1;
      
      return diffA.distance - diffB.distance;
    })[0];
  }

  /**
   * 验证版本升级路径
   */
  validateUpgradePath(
    fromVersion: string,
    toVersion: string
  ): {
    valid: boolean;
    steps: string[];
    breakingChanges: string[];
  } {
    const from = this.versionManager.parse(fromVersion);
    const to = this.versionManager.parse(toVersion);

    // 检查是否可以升级
    if (from.major > to.major) {
      return {
        valid: false,
        steps: [],
        breakingChanges: ['Cannot downgrade major version']
      };
    }

    const steps: string[] = [];
    const breakingChanges: string[] = [];

    // 生成升级步骤
    if (from.major < to.major) {
      steps.push(`Upgrade major version: ${from.major} → ${to.major}`);
      breakingChanges.push('Major version upgrade may contain breaking changes');
    }

    if (from.minor < to.minor) {
      steps.push(`Update minor version: ${from.minor} → ${to.minor}`);
    }

    if (from.patch < to.patch) {
      steps.push(`Apply patches: ${from.patch} → ${to.patch}`);
    }

    return {
      valid: true,
      steps,
      breakingChanges
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.compatibilityCache.clear();
  }

  /**
   * 获取兼容性报告
   */
  generateCompatibilityReport(
    localVersion: string,
    remoteVersions: string[]
  ): string {
    const results = this.checkBatchCompatibility(localVersion, remoteVersions);
    
    let report = `# A2A 兼容性报告\n\n`;
    report += `本地版本: ${localVersion}\n\n`;
    report += `## 兼容性检查结果\n\n`;
    report += `| 远程版本 | 兼容级别 | 可通信 | 需要降级 |\n`;
    report += `|---------|---------|--------|---------|\n`;

    for (const [version, result] of results) {
      const canComm = result.canCommunicate ? '✓' : '✗';
      const needsDowngrade = result.requiresDowngrade ? '✓' : '✗';
      report += `| ${version} | ${result.level} | ${canComm} | ${needsDowngrade} |\n`;
    }

    report += `\n## 功能支持情况\n\n`;
    for (const [version, result] of results) {
      if (result.features.supported.length > 0) {
        report += `### ${version}\n`;
        report += `- 支持功能: ${result.features.supported.join(', ')}\n`;
        if (result.features.unsupported.length > 0) {
          report += `- 不支持功能: ${result.features.unsupported.join(', ')}\n`;
        }
        if (result.features.deprecated.length > 0) {
          report += `- 已弃用功能: ${result.features.deprecated.join(', ')}\n`;
        }
        report += `\n`;
      }
    }

    return report;
  }
}

export default CompatibilityChecker;
