/**
 * RESTful API 协议实现
 * 包含服务端和客户端
 */

import express from 'express';
import http from 'http';

// 模拟Agent服务
class AgentService {
  constructor() {
    this.agents = new Map();
    this.messages = [];
  }

  registerAgent(agentId, metadata) {
    this.agents.set(agentId, {
      id: agentId,
      ...metadata,
      registeredAt: Date.now()
    });
    return { success: true, agentId };
  }

  sendMessage(from, to, content) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from,
      to,
      content,
      timestamp: Date.now()
    };
    this.messages.push(message);
    return message;
  }

  getMessages(agentId) {
    return this.messages.filter(m => m.to === agentId);
  }

  discoverAgents(criteria = {}) {
    return Array.from(this.agents.values()).filter(agent => {
      if (criteria.type && agent.type !== criteria.type) return false;
      if (criteria.capability && !agent.capabilities?.includes(criteria.capability)) return false;
      return true;
    });
  }
}

const agentService = new AgentService();

// Express 服务端
export function createRESTServer(port = 3001) {
  const app = express();
  app.use(express.json());

  // Agent注册
  app.post('/api/v1/agents/register', (req, res) => {
    const { agentId, ...metadata } = req.body;
    const result = agentService.registerAgent(agentId, metadata);
    res.json(result);
  });

  // 发送消息
  app.post('/api/v1/messages', (req, res) => {
    const { from, to, content } = req.body;
    const message = agentService.sendMessage(from, to, content);
    res.json(message);
  });

  // 获取消息
  app.get('/api/v1/agents/:agentId/messages', (req, res) => {
    const messages = agentService.getMessages(req.params.agentId);
    res.json({ messages });
  });

  // 发现Agent
  app.get('/api/v1/agents/discover', (req, res) => {
    const criteria = {
      type: req.query.type,
      capability: req.query.capability
    };
    const agents = agentService.discoverAgents(criteria);
    res.json({ agents });
  });

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', protocol: 'RESTful' });
  });

  const server = http.createServer(app);
  
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`RESTful server running on port ${port}`);
      resolve(server);
    });
  });
}

// RESTful 客户端
export class RESTClient {
  constructor(baseURL = 'http://localhost:3001') {
    this.baseURL = baseURL;
  }

  async request(path, options = {}) {
    const url = `${this.baseURL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    return response.json();
  }

  async registerAgent(agentId, metadata) {
    return this.request('/api/v1/agents/register', {
      method: 'POST',
      body: JSON.stringify({ agentId, ...metadata })
    });
  }

  async sendMessage(from, to, content) {
    return this.request('/api/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ from, to, content })
    });
  }

  async getMessages(agentId) {
    return this.request(`/api/v1/agents/${agentId}/messages`);
  }

  async discoverAgents(criteria = {}) {
    const params = new URLSearchParams(criteria);
    return this.request(`/api/v1/agents/discover?${params}`);
  }

  async health() {
    return this.request('/health');
  }
}

// 如果直接运行此文件，启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  createRESTServer(3001);
}
