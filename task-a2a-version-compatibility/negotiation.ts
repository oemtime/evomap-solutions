/**
 * A2A Protocol Negotiator
 * 协议协商模块 - 处理Agent间的版本协商和降级策略
 */

import { VersionManager, Version, CompatibilityLevel, CompatibilityResult } from './version-manager';

export interface NegotiationOptions {
  timeout: number;
  retryAttempts: number;
  fallbackStrategy: 'oldest' | 'newest' | 'lowest';
  strictMode: boolean;
}

export interface NegotiationRequest {
  version: string;
  supportedVersions: string[];
  preferredFeatures: string[];
  capabilities: string[];
}

export interface NegotiationResponse {
  acceptedVersion: string;
  rejectedVersions: string[];
  supportedFeatures: string[];
  downgradeRequired: boolean;
  negotiationId: string;
}

export interface NegotiationResult {
  success: boolean;
  agreedVersion: string;
  protocolVersion: number;
  features: string[];
  limitations: string[];
  warnings: string[];
  negotiationId: string;
  downgradeInfo?: {
    from: string;
    to: string;
    deprecatedFeatures: string[];
  };
}

export interface ProtocolHandshake {
  initiatorVersion: string;
  responderVersion: string;
  agreedVersion: string;
  timestamp: number;
  negotiationId: string;
}

/**
 * 协议协商器类
 */
export class ProtocolNegotiator {
  private versionManager: VersionManager;
  private options: NegotiationOptions;
  private handshakeHistory: ProtocolHandshake[] = [];
  private activeNegotiations: Map<string, {
    request: NegotiationRequest;
    timestamp: number;
    status: 'pending' | 'completed' | 'failed';
  }> = new Map();

  constructor(
    versionManager: VersionManager,
    options: Partial<NegotiationOptions> = {}
  ) {
    this.versionManager = versionManager;
    this.options = {
      timeout: 30000,
      retryAttempts: 3,
      fallbackStrategy: 'lowest',
      strictMode: false,
      ...options
    };
  }

  /**
   * 启动协议协商
   */
  async negotiate(
    localRequest: NegotiationRequest,
    remoteResponse?: NegotiationResponse
  ): Promise<NegotiationResult> {
    const negotiationId = this.generateNegotiationId();
    
    try {
      // 记录协商开始
      this.activeNegotiations.set(negotiationId, {
        request: localRequest,
        timestamp: Date.now(),
        status: 'pending'
      });

      // 如果没有远程响应，发起新的协商
      if (!remoteResponse) {
        return await this.initiateNegotiation(localRequest, negotiationId);
      }

      // 处理远程响应
      return await this.processNegotiationResponse(
        localRequest, 
        remoteResponse, 
        negotiationId
      );

    } catch (error) {
      this.activeNegotiations.set(negotiationId, {
        request: localRequest,
        timestamp: Date.now(),
        status: 'failed'
      });

      return this.createFailedResult(negotiationId, error);
    }
  }

  /**
   * 发起新的协商
   */
  private async initiateNegotiation(
    request: NegotiationRequest,
    negotiationId: string
  ): Promise<NegotiationResult> {
    const localVersion = this.versionManager.getCurrentVersionString();
    
    // 检查本地版本是否在支持列表中
    if (!request.supportedVersions.includes(localVersion)) {
      request.supportedVersions.push(localVersion);
    }

    // 准备协商请求
    const negotiationRequest: NegotiationRequest = {
      version: localVersion,
      supportedVersions: request.supportedVersions,
      preferredFeatures: request.preferredFeatures || [],
      capabilities: request.capabilities || []
    };

    // 这里实际会通过网络发送请求
    // 返回等待状态
    return {
      success: true,
      agreedVersion: localVersion,
      protocolVersion: this.extractProtocolVersion(localVersion),
      features: negotiationRequest.preferredFeatures,
      limitations: [],
      warnings: ['Waiting for remote response'],
      negotiationId
    };
  }

  /**
   * 处理协商响应
   */
  private async processNegotiationResponse(
    localRequest: NegotiationRequest,
    remoteResponse: NegotiationResponse,
    negotiationId: string
  ): Promise<NegotiationResult> {
    const localVersion = localRequest.version;
    const remoteVersion = remoteResponse.acceptedVersion;

    // 比较版本
    const comparison = this.versionManager.compare(localVersion, remoteVersion);
    
    // 确定协商结果
    let agreedVersion: string;
    let downgradeInfo: NegotiationResult['downgradeInfo'] | undefined;
    const warnings: string[] = [];
    const limitations: string[] = [];

    if (comparison === 0) {
      // 版本相同
      agreedVersion = localVersion;
    } else if (comparison > 0) {
      // 本地版本更新，需要降级
      agreedVersion = remoteVersion;
      downgradeInfo = await this.calculateDowngrade(localVersion, remoteVersion);
      warnings.push(`Downgraded from ${localVersion} to ${remoteVersion}`);
      
      if (downgradeInfo.deprecatedFeatures.length > 0) {
        limitations.push(...downgradeInfo.deprecatedFeatures.map(f => 
          `Feature '${f}' not available in ${remoteVersion}`
        ));
      }
    } else {
      // 远程版本更新，使用本地版本
      agreedVersion = localVersion;
      warnings.push(`Remote agent has newer version (${remoteVersion}), using ${localVersion}`);
    }

    // 确定支持的功能
    const supportedFeatures = this.calculateSupportedFeatures(
      localRequest.preferredFeatures,
      agreedVersion
    );

    // 记录握手历史
    const handshake: ProtocolHandshake = {
      initiatorVersion: localVersion,
      responderVersion: remoteVersion,
      agreedVersion,
      timestamp: Date.now(),
      negotiationId
    };
    this.handshakeHistory.push(handshake);

    // 更新协商状态
    this.activeNegotiations.set(negotiationId, {
      request: localRequest,
      timestamp: Date.now(),
      status: 'completed'
    });

    return {
      success: true,
      agreedVersion,
      protocolVersion: this.extractProtocolVersion(agreedVersion),
      features: supportedFeatures,
      limitations,
      warnings,
      negotiationId,
      downgradeInfo
    };
  }

  /**
   * 计算降级信息
   */
  private async calculateDowngrade(
    fromVersion: string,
    toVersion: string
  ): Promise<{
    from: string;
    to: string;
    deprecatedFeatures: string[];
  }> {
    const deprecatedFeatures: string[] = [];
    
    // 获取当前支持的所有功能
    const allFeatures = this.getAllKnownFeatures();
    
    for (const feature of allFeatures) {
      const availableInFrom = this.versionManager.isFeatureAvailable(feature, fromVersion);
      const availableInTo = this.versionManager.isFeatureAvailable(feature, toVersion);
      
      if (availableInFrom && !availableInTo) {
        deprecatedFeatures.push(feature);
      }
    }

    return {
      from: fromVersion,
      to: toVersion,
      deprecatedFeatures
    };
  }

  /**
   * 计算支持的功能列表
   */
  private calculateSupportedFeatures(
    preferredFeatures: string[],
    agreedVersion: string
  ): string[] {
    return preferredFeatures.filter(feature => 
      this.versionManager.isFeatureAvailable(feature, agreedVersion)
    );
  }

  /**
   * 寻找共同支持的版本
   */
  findCommonVersion(
    localVersions: string[],
    remoteVersions: string[]
  ): string | null {
    // 排序版本（从新到旧）
    const sortedLocal = [...localVersions].sort((a, b) => 
      this.versionManager.compare(b, a)
    );
    const sortedRemote = [...remoteVersions].sort((a, b) => 
      this.versionManager.compare(b, a)
    );

    // 寻找最高的共同版本
    for (const localVer of sortedLocal) {
      for (const remoteVer of sortedRemote) {
        if (this.areVersionsCompatible(localVer, remoteVer)) {
          // 返回较低的版本（保证兼容性）
          return this.versionManager.compare(localVer, remoteVer) <= 0 
            ? localVer 
            : remoteVer;
        }
      }
    }

    // 如果没有共同兼容版本，使用回退策略
    return this.applyFallbackStrategy(sortedLocal, sortedRemote);
  }

  /**
   * 检查两个版本是否兼容
   */
  private areVersionsCompatible(v1: string, v2: string): boolean {
    const ver1 = this.versionManager.parse(v1);
    const ver2 = this.versionManager.parse(v2);

    // 主版本号必须相同才能兼容
    return ver1.major === ver2.major;
  }

  /**
   * 应用回退策略
   */
  private applyFallbackStrategy(
    localVersions: string[],
    remoteVersions: string[]
  ): string | null {
    const allVersions = [...new Set([...localVersions, ...remoteVersions])];
    
    switch (this.options.fallbackStrategy) {
      case 'oldest':
        return allVersions.sort((a, b) => 
          this.versionManager.compare(a, b)
        )[0] || null;
      
      case 'newest':
        return allVersions.sort((a, b) => 
          this.versionManager.compare(b, a)
        )[0] || null;
      
      case 'lowest':
      default:
        // 选择最低的兼容版本
        return allVersions.sort((a, b) => 
          this.versionManager.compare(a, b)
        )[0] || null;
    }
  }

  /**
   * 生成协商ID
   */
  private generateNegotiationId(): string {
    return `neg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 提取协议版本号
   */
  private extractProtocolVersion(version: string): number {
    const ver = this.versionManager.parse(version);
    return ver.major;
  }

  /**
   * 创建失败结果
   */
  private createFailedResult(
    negotiationId: string,
    error: any
  ): NegotiationResult {
    return {
      success: false,
      agreedVersion: '',
      protocolVersion: 0,
      features: [],
      limitations: [],
      warnings: [`Negotiation failed: ${error.message || error}`],
      negotiationId
    };
  }

  /**
   * 获取所有已知功能（示例）
   */
  private getAllKnownFeatures(): string[] {
    return [
      'streaming',
      'batch-processing',
      'encryption',
      'compression',
      'heartbeat',
      'message-ack',
      'priority-queue',
      'metadata',
      'attachments'
    ];
  }

  /**
   * 获取协商历史
   */
  getHandshakeHistory(): ProtocolHandshake[] {
    return [...this.handshakeHistory];
  }

  /**
   * 清除协商历史
   */
  clearHistory(): void {
    this.handshakeHistory = [];
    this.activeNegotiations.clear();
  }

  /**
   * 检查协商是否超时
   */
  isNegotiationTimedOut(negotiationId: string): boolean {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (!negotiation) return true;
    
    return Date.now() - negotiation.timestamp > this.options.timeout;
  }
}

export default ProtocolNegotiator;
