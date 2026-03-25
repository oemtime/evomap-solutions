/**
 * Message Queue 协议实现
 * 使用 Redis Pub/Sub 作为轻量级消息队列
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';

// 模拟消息队列服务
export class MessageQueueService extends EventEmitter {
  constructor(redisConfig = {}) {
    super();
    this.redis = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
    this.agents = new Map();
    this.messageHistory = [];
    this.subscriptions = new Map();
  }

  async initialize() {
    // 订阅Agent注册频道
    await this.subscriber.subscribe('a2a:agent:register');
    await this.subscriber.subscribe('a2a:broadcast');
    
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });
    
    console.log('Message Queue service initialized');
  }

  handleMessage(channel, message) {
    try {
      const data = JSON.parse(message);
      this.emit('message', { channel, data });
      
      if (channel === 'a2a:agent:register') {
        this.agents.set(data.agentId, data);
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  }

  async registerAgent(agentId, metadata) {
    const agentInfo = {
      agentId,
      ...metadata,
      registeredAt: Date.now()
    };
    
    this.agents.set(agentId, agentInfo);
    
    // 发布注册事件
    await this.redis.publish('a2a:agent:register', JSON.stringify(agentInfo));
    
    // 创建Agent专属队列
    await this.redis.lpush(`a2a:queue:${agentId}`, JSON.stringify({
      type: 'system',
      content: 'Agent registered successfully'
    }));
    
    return { success: true, agentId };
  }

  async sendMessage(from, to, content, headers = {}) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from,
      to,
      content,
      headers,
      timestamp: Date.now()
    };
    
    // 存储消息历史
    this.messageHistory.push(message);
    
    // 推送到接收者队列
    await this.redis.lpush(`a2a:queue:${to}`, JSON.stringify(message));
    
    // 发布实时通知
    await this.redis.publish(`a2a:agent:${to}`, JSON.stringify(message));
    
    return message;
  }

  async getMessages(agentId, limit = 10) {
    const messages = await this.redis.lrange(`a2a:queue:${agentId}`, 0, limit - 1);
    return messages.map(m => JSON.parse(m));
  }

  async discoverAgents(criteria = {}) {
    const agents = [];
    for (const [id, agent] of this.agents) {
      if (criteria.type && agent.type !== criteria.type) continue;
      if (criteria.capability && !agent.capabilities?.includes(criteria.capability)) continue;
      agents.push(agent);
    }
    return agents;
  }

  async subscribeToAgent(agentId, callback) {
    const channel = `a2a:agent:${agentId}`;
    
    if (!this.subscriptions.has(channel)) {
      await this.subscriber.subscribe(channel);
      this.subscriptions.set(channel, new Set());
    }
    
    this.subscriptions.get(channel).add(callback);
    
    // 监听消息
    const handler = (ch, message) => {
      if (ch === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      }
    };
    
    this.subscriber.on('message', handler);
    
    return () => {
      this.subscriptions.get(channel)?.delete(callback);
    };
  }

  async broadcast(content, headers = {}) {
    const message = {
      id: `broadcast_${Date.now()}`,
      content,
      headers,
      timestamp: Date.now()
    };
    
    await this.redis.publish('a2a:broadcast', JSON.stringify(message));
    return message;
  }

  async health() {
    try {
      await this.redis.ping();
      return { status: 'ok', protocol: 'MessageQueue' };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  async close() {
    await this.redis.quit();
    await this.subscriber.quit();
  }
}

// MQ 客户端
export class MQClient extends EventEmitter {
  constructor(redisConfig = {}) {
    super();
    this.redis = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
    this.agentId = null;
  }

  async connect(agentId, metadata = {}) {
    this.agentId = agentId;
    
    // 注册Agent
    await this.redis.publish('a2a:agent:register', JSON.stringify({
      agentId,
      ...metadata,
      registeredAt: Date.now()
    }));
    
    // 订阅个人消息频道
    await this.subscriber.subscribe(`a2a:agent:${agentId}`);
    this.subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.emit('message', data);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    });
    
    return { success: true, agentId };
  }

  async sendMessage(to, content, headers = {}) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from: this.agentId,
      to,
      content,
      headers,
      timestamp: Date.now()
    };
    
    await this.redis.lpush(`a2a:queue:${to}`, JSON.stringify(message));
    await this.redis.publish(`a2a:agent:${to}`, JSON.stringify(message));
    
    return message;
  }

  async getMessages(limit = 10) {
    const messages = await this.redis.lrange(`a2a:queue:${this.agentId}`, 0, limit - 1);
    return messages.map(m => JSON.parse(m));
  }

  async discoverAgents(criteria = {}) {
    // 从Redis获取所有注册的Agent
    const keys = await this.redis.keys('a2a:agent:*');
    const agents = [];
    
    for (const key of keys) {
      const agentData = await this.redis.get(key);
      if (agentData) {
        const agent = JSON.parse(agentData);
        if (criteria.type && agent.type !== criteria.type) continue;
        if (criteria.capability && !agent.capabilities?.includes(criteria.capability)) continue;
        agents.push(agent);
      }
    }
    
    return agents;
  }

  async close() {
    await this.redis.quit();
    await this.subscriber.quit();
  }
}

// 如果直接运行此文件，启动服务
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new MessageQueueService();
  await service.initialize();
  console.log('Message Queue server running');
  
  // 保持进程运行
  process.on('SIGINT', async () => {
    await service.close();
    process.exit(0);
  });
}
