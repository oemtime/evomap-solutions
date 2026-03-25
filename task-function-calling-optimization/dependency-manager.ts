/**
 * 依赖管理器 - Dependency Manager
 * 
 * 管理工具间的依赖关系，支持自动依赖检测和手动声明
 */

export interface DependencyNode {
  id: string;
  toolName: string;
  dependencies: string[];
  dependents: string[];
  level: number;  // 拓扑层级
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  levels: string[][];  // 按层级分组的节点ID
  hasCycle: boolean;
  criticalPath: string[];  // 关键路径
}

export interface DependencyRule {
  toolPattern: RegExp | string;
  dependsOn?: (RegExp | string)[];
  provides?: string[];  // 提供的数据类型
  requires?: string[];  // 需要的数据类型
}

/**
 * 依赖管理器
 */
export class DependencyManager {
  private rules: DependencyRule[] = [];
  private paramCache = new Map<string, string[]>();  // 工具参数缓存

  /**
   * 注册依赖规则
   */
  registerRule(rule: DependencyRule): void {
    this.rules.push(rule);
  }

  /**
   * 从工具调用构建依赖图
   */
  buildGraph(toolCalls: Array<{ id: string; name: string; params: Record<string, any>; dependencies?: string[] }>): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    
    // 初始化节点
    toolCalls.forEach(call => {
      nodes.set(call.id, {
        id: call.id,
        toolName: call.name,
        dependencies: call.dependencies || [],
        dependents: [],
        level: 0
      });
    });

    // 自动检测依赖
    toolCalls.forEach(call => {
      const autoDeps = this.detectDependencies(call, toolCalls);
      const node = nodes.get(call.id)!;
      
      // 合并手动和自动检测的依赖
      autoDeps.forEach(depId => {
        if (!node.dependencies.includes(depId) && depId !== call.id) {
          node.dependencies.push(depId);
        }
      });
    });

    // 构建反向依赖（dependents）
    nodes.forEach(node => {
      node.dependencies.forEach(depId => {
        const depNode = nodes.get(depId);
        if (depNode && !depNode.dependents.includes(node.id)) {
          depNode.dependents.push(node.id);
        }
      });
    });

    // 检测循环依赖
    const hasCycle = this.detectCycle(nodes);

    // 计算拓扑层级
    if (!hasCycle) {
      this.calculateLevels(nodes);
    }

    // 构建层级分组
    const levels: string[][] = [];
    nodes.forEach(node => {
      if (!levels[node.level]) {
        levels[node.level] = [];
      }
      levels[node.level].push(node.id);
    });

    // 计算关键路径
    const criticalPath = hasCycle ? [] : this.findCriticalPath(nodes);

    return {
      nodes,
      levels,
      hasCycle,
      criticalPath
    };
  }

  /**
   * 自动检测依赖关系
   * 
   * 基于以下规则：
   * 1. 参数引用：工具A的参数值是工具B的结果
   * 2. 数据类型：工具A需要的数据由工具B提供
   * 3. 命名模式：基于工具名称的隐式依赖
   */
  private detectDependencies(
    call: { id: string; name: string; params: Record<string, any> },
    allCalls: Array<{ id: string; name: string; params: Record<string, any> }>
  ): string[] {
    const dependencies: string[] = [];

    // 1. 检查参数引用
    const paramValues = Object.values(call.params);
    allCalls.forEach(otherCall => {
      if (otherCall.id === call.id) return;
      
      // 检查是否引用了其他工具的结果占位符
      // 例如: { "city": "{{getLocation.result.city}}" }
      paramValues.forEach(value => {
        if (typeof value === 'string' && value.includes(`{{${otherCall.name}`)) {
          dependencies.push(otherCall.id);
        }
      });
    });

    // 2. 应用规则匹配
    this.rules.forEach(rule => {
      if (this.matchesPattern(call.name, rule.toolPattern)) {
        // 检查依赖规则
        rule.dependsOn?.forEach(depPattern => {
          allCalls.forEach(otherCall => {
            if (otherCall.id !== call.id && this.matchesPattern(otherCall.name, depPattern)) {
              if (!dependencies.includes(otherCall.id)) {
                dependencies.push(otherCall.id);
              }
            }
          });
        });

        // 检查数据需求
        if (rule.requires) {
          allCalls.forEach(otherCall => {
            const otherRule = this.rules.find(r => this.matchesPattern(otherCall.name, r.toolPattern));
            if (otherRule?.provides) {
              const hasMatch = rule.requires!.some(req => 
                otherRule.provides!.some(prov => this.matchesPattern(req, prov))
              );
              if (hasMatch && !dependencies.includes(otherCall.id)) {
                dependencies.push(otherCall.id);
              }
            }
          });
        }
      }
    });

    return dependencies;
  }

  /**
   * 检测循环依赖
   */
  private detectCycle(nodes: Map<string, DependencyNode>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (hasCycleDFS(depId)) return true;
          } else if (recursionStack.has(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (hasCycleDFS(nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * 计算拓扑层级
   */
  private calculateLevels(nodes: Map<string, DependencyNode>): void {
    const inDegree = new Map<string, number>();
    
    nodes.forEach(node => {
      inDegree.set(node.id, node.dependencies.length);
    });

    let currentLevel = 0;
    let changed = true;

    while (changed) {
      changed = false;
      const currentLevelNodes: string[] = [];

      nodes.forEach(node => {
        if (node.level === 0 && inDegree.get(node.id) === 0 && !currentLevelNodes.includes(node.id)) {
          // 检查是否所有依赖都已在更低层级
          const allDepsResolved = node.dependencies.every(depId => {
            const depNode = nodes.get(depId);
            return depNode && depNode.level < currentLevel;
          });

          if (allDepsResolved || node.dependencies.length === 0) {
            node.level = currentLevel;
            currentLevelNodes.push(node.id);
            changed = true;
          }
        }
      });

      // 减少依赖这些节点的入度
      currentLevelNodes.forEach(nodeId => {
        const node = nodes.get(nodeId);
        node?.dependents.forEach(depId => {
          inDegree.set(depId, inDegree.get(depId)! - 1);
        });
      });

      currentLevel++;
    }
  }

  /**
   * 查找关键路径
   */
  private findCriticalPath(nodes: Map<string, DependencyNode>): string[] {
    // 找到最长路径（最多层级）
    let longestPath: string[] = [];

    const findPath = (nodeId: string, currentPath: string[]): void => {
      const node = nodes.get(nodeId);
      if (!node) return;

      currentPath.push(nodeId);

      if (node.dependents.length === 0) {
        if (currentPath.length > longestPath.length) {
          longestPath = [...currentPath];
        }
      } else {
        node.dependents.forEach(depId => {
          findPath(depId, [...currentPath]);
        });
      }
    };

    // 从根节点（无依赖）开始
    nodes.forEach(node => {
      if (node.dependencies.length === 0) {
        findPath(node.id, []);
      }
    });

    return longestPath;
  }

  /**
   * 匹配模式
   */
  private matchesPattern(value: string, pattern: RegExp | string): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(value);
    }
    return value === pattern || value.includes(pattern);
  }

  /**
   * 验证依赖图
   */
  validateGraph(graph: DependencyGraph): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (graph.hasCycle) {
      errors.push('Dependency graph contains cycles');
    }

    // 检查所有依赖是否存在
    graph.nodes.forEach(node => {
      node.dependencies.forEach(depId => {
        if (!graph.nodes.has(depId)) {
          errors.push(`Node ${node.id} depends on non-existent node ${depId}`);
        }
      });
    });

    // 检查层级一致性
    graph.nodes.forEach(node => {
      node.dependencies.forEach(depId => {
        const depNode = graph.nodes.get(depId);
        if (depNode && depNode.level >= node.level) {
          errors.push(`Node ${node.id} has dependency ${depId} at same or higher level`);
        }
      });
    });

    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取执行顺序建议
   */
  getExecutionOrder(graph: DependencyGraph): string[] {
    if (graph.hasCycle) {
      throw new Error('Cannot determine execution order: graph has cycles');
    }

    const order: string[] = [];
    graph.levels.forEach(level => {
      order.push(...level);
    });

    return order;
  }

  /**
   * 可视化依赖图
   */
  visualize(graph: DependencyGraph): string {
    const lines: string[] = ['Dependency Graph:'];
    
    graph.levels.forEach((level, idx) => {
      lines.push(`  Level ${idx}:`);
      level.forEach(id => {
        const node = graph.nodes.get(id)!;
        const deps = node.dependencies.length > 0 ? ` [depends: ${node.dependencies.join(', ')}]` : '';
        lines.push(`    - ${node.toolName} (${id})${deps}`);
      });
    });

    lines.push(`\nCritical Path: ${graph.criticalPath.join(' -> ')}`);
    lines.push(`Max Parallelism: ${Math.max(...graph.levels.map(l => l.length))}`);

    return lines.join('\n');
  }
}

/**
 * 预定义依赖规则
 */
export const CommonDependencyRules: DependencyRule[] = [
  {
    toolPattern: /getWeather|fetchWeather/,
    requires: ['location'],
    provides: ['weather', 'temperature']
  },
  {
    toolPattern: /getLocation|fetchLocation/,
    provides: ['location', 'coordinates']
  },
  {
    toolPattern: /sendEmail|sendMessage/,
    requires: ['recipient', 'content']
  },
  {
    toolPattern: /search/,
    provides: ['search_results', 'documents']
  },
  {
    toolPattern: /analyze|summarize/,
    dependsOn: [/search|fetch/],
    requires: ['documents']
  }
];

/**
 * 使用示例
 */
export function example() {
  const manager = new DependencyManager();
  
  // 注册常见规则
  CommonDependencyRules.forEach(rule => manager.registerRule(rule));

  // 定义工具调用
  const toolCalls = [
    { id: '1', name: 'getLocation', params: { address: 'Beijing' } },
    { id: '2', name: 'getWeather', params: { location: '{{getLocation.result}}' } },
    { id: '3', name: 'searchNews', params: { query: 'weather' } },
    { id: '4', name: 'summarize', params: { content: '{{searchNews.result}}' } }
  ];

  // 构建依赖图
  const graph = manager.buildGraph(toolCalls);
  
  console.log(manager.visualize(graph));
  console.log('Execution Order:', manager.getExecutionOrder(graph));
  
  return graph;
}
