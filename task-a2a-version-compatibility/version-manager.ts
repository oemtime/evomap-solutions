/**
 * A2A Protocol Version Manager
 * 版本管理核心模块 - 负责版本解析、比较和范围匹配
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string[];
  build?: string[];
}

export interface VersionRange {
  min?: Version;
  max?: Version;
  exact?: Version;
  operator: '>' | '>=' | '<' | '<=' | '=' | '^' | '~';
}

export enum CompatibilityLevel {
  FULL = 'full',           // 完全兼容
  BACKWARD = 'backward',   // 仅向后兼容
  FORWARD = 'forward',     // 仅向前兼容
  PARTIAL = 'partial',     // 部分兼容
  NONE = 'none'            // 不兼容
}

export interface CompatibilityResult {
  level: CompatibilityLevel;
  canCommunicate: boolean;
  requiresDowngrade: boolean;
  targetVersion?: string;
  features: {
    supported: string[];
    unsupported: string[];
    deprecated: string[];
  };
}

/**
 * 版本管理器类
 */
export class VersionManager {
  private currentVersion: Version;
  private supportedVersions: Set<string> = new Set();
  private featureMatrix: Map<string, VersionRange[]> = new Map();

  constructor(version: string) {
    this.currentVersion = this.parse(version);
    this.supportedVersions.add(version);
  }

  /**
   * 解析版本字符串为Version对象
   */
  parse(version: string): Version {
    const cleaned = version.trim().replace(/^v/, '');
    const [mainPart, ...rest] = cleaned.split('+');
    const [versionPart, prereleasePart] = mainPart.split('-');
    const [major, minor, patch] = versionPart.split('.').map(Number);

    return {
      major: major || 0,
      minor: minor || 0,
      patch: patch || 0,
      prerelease: prereleasePart ? prereleasePart.split('.') : undefined,
      build: rest.length > 0 ? rest.join('+').split('.') : undefined
    };
  }

  /**
   * 将Version对象格式化为字符串
   */
  stringify(version: Version): string {
    let result = `${version.major}.${version.minor}.${version.patch}`;
    if (version.prerelease && version.prerelease.length > 0) {
      result += `-${version.prerelease.join('.')}`;
    }
    if (version.build && version.build.length > 0) {
      result += `+${version.build.join('.')}`;
    }
    return result;
  }

  /**
   * 比较两个版本
   * @returns -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
   */
  compare(v1: Version | string, v2: Version | string): number {
    const ver1 = typeof v1 === 'string' ? this.parse(v1) : v1;
    const ver2 = typeof v2 === 'string' ? this.parse(v2) : v2;

    // 比较主版本号
    if (ver1.major !== ver2.major) {
      return ver1.major > ver2.major ? 1 : -1;
    }

    // 比较次版本号
    if (ver1.minor !== ver2.minor) {
      return ver1.minor > ver2.minor ? 1 : -1;
    }

    // 比较修订号
    if (ver1.patch !== ver2.patch) {
      return ver1.patch > ver2.patch ? 1 : -1;
    }

    // 处理预发布版本
    if (ver1.prerelease || ver2.prerelease) {
      if (!ver1.prerelease && ver2.prerelease) return 1;
      if (ver1.prerelease && !ver2.prerelease) return -1;
      if (ver1.prerelease && ver2.prerelease) {
        const len = Math.min(ver1.prerelease.length, ver2.prerelease.length);
        for (let i = 0; i < len; i++) {
          const p1 = ver1.prerelease[i];
          const p2 = ver2.prerelease[i];
          const n1 = parseInt(p1, 10);
          const n2 = parseInt(p2, 10);
          
          if (!isNaN(n1) && !isNaN(n2)) {
            if (n1 !== n2) return n1 > n2 ? 1 : -1;
          } else {
            if (p1 !== p2) return p1 > p2 ? 1 : -1;
          }
        }
        if (ver1.prerelease.length !== ver2.prerelease.length) {
          return ver1.prerelease.length > ver2.prerelease.length ? 1 : -1;
        }
      }
    }

    return 0;
  }

  /**
   * 检查版本是否在指定范围内
   */
  satisfies(version: Version | string, range: string): boolean {
    const ver = typeof version === 'string' ? this.parse(version) : version;
    
    // 处理特殊范围
    if (range === '*') return true;
    if (range === '^') {
      // 兼容相同主版本号的最新版本
      return ver.major === this.currentVersion.major;
    }
    if (range === '~') {
      // 兼容相同主次版本号的最新修订
      return ver.major === this.currentVersion.major && 
             ver.minor === this.currentVersion.minor;
    }

    // 解析范围表达式
    const match = range.match(/^([>=<^~]+)?(.+)$/);
    if (!match) return false;

    const [, operator = '=', versionStr] = match;
    const targetVer = this.parse(versionStr);

    const cmp = this.compare(ver, targetVer);

    switch (operator) {
      case '>': return cmp > 0;
      case '>=': return cmp >= 0;
      case '<': return cmp < 0;
      case '<=': return cmp <= 0;
      case '=': return cmp === 0;
      case '^':
        return ver.major === targetVer.major && cmp >= 0;
      case '~':
        return ver.major === targetVer.major && 
               ver.minor === targetVer.minor && 
               cmp >= 0;
      default:
        return cmp === 0;
    }
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion(): Version {
    return { ...this.currentVersion };
  }

  /**
   * 获取当前版本字符串
   */
  getCurrentVersionString(): string {
    return this.stringify(this.currentVersion);
  }

  /**
   * 注册支持的版本
   */
  registerSupportedVersion(version: string): void {
    this.supportedVersions.add(version);
  }

  /**
   * 获取所有支持的版本
   */
  getSupportedVersions(): string[] {
    return Array.from(this.supportedVersions).sort((a, b) => 
      this.compare(a, b)
    );
  }

  /**
   * 注册功能与版本要求
   */
  registerFeature(feature: string, minVersion: string, maxVersion?: string): void {
    const range: VersionRange = {
      min: this.parse(minVersion),
      max: maxVersion ? this.parse(maxVersion) : undefined,
      operator: '>='
    };

    if (!this.featureMatrix.has(feature)) {
      this.featureMatrix.set(feature, []);
    }
    this.featureMatrix.get(feature)!.push(range);
  }

  /**
   * 检查功能在指定版本是否可用
   */
  isFeatureAvailable(feature: string, version?: Version | string): boolean {
    const ver = version ? 
      (typeof version === 'string' ? this.parse(version) : version) :
      this.currentVersion;

    const ranges = this.featureMatrix.get(feature);
    if (!ranges) return false;

    return ranges.some(range => {
      const minOk = range.min ? this.compare(ver, range.min) >= 0 : true;
      const maxOk = range.max ? this.compare(ver, range.max) <= 0 : true;
      return minOk && maxOk;
    });
  }

  /**
   * 计算版本差异
   */
  getVersionDiff(v1: Version | string, v2: Version | string): {
    type: 'major' | 'minor' | 'patch' | 'none';
    distance: number;
  } {
    const ver1 = typeof v1 === 'string' ? this.parse(v1) : v1;
    const ver2 = typeof v2 === 'string' ? this.parse(v2) : v2;

    if (ver1.major !== ver2.major) {
      return { type: 'major', distance: Math.abs(ver1.major - ver2.major) };
    }
    if (ver1.minor !== ver2.minor) {
      return { type: 'minor', distance: Math.abs(ver1.minor - ver2.minor) };
    }
    if (ver1.patch !== ver2.patch) {
      return { type: 'patch', distance: Math.abs(ver1.patch - ver2.patch) };
    }
    return { type: 'none', distance: 0 };
  }

  /**
   * 找到最大兼容版本
   */
  findMaxCompatibleVersion(versions: string[]): string | null {
    const sorted = versions
      .map(v => ({ str: v, ver: this.parse(v) }))
      .sort((a, b) => this.compare(b.ver, a.ver));

    for (const { str } of sorted) {
      if (this.isCompatible(str)) {
        return str;
      }
    }
    return null;
  }

  /**
   * 检查是否与当前版本兼容
   */
  isCompatible(version: string): boolean {
    const ver = this.parse(version);
    return ver.major === this.currentVersion.major;
  }
}

export default VersionManager;
