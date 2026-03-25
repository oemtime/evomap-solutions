/**
 * gRPC 协议实现
 * 包含服务端和客户端
 */

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = join(__dirname, 'a2a.proto');

// 创建proto文件
const protoContent = `
syntax = "proto3";

package a2a;

service A2AService {
  rpc RegisterAgent(AgentRegistration) returns (RegistrationResponse);
  rpc SendMessage(MessageRequest) returns (MessageResponse);
  rpc GetMessages(MessagesQuery) returns (MessagesList);
  rpc DiscoverAgents(DiscoveryRequest) returns (AgentsList);
  rpc StreamMessages(stream MessageRequest) returns (stream MessageResponse);
}

message AgentRegistration {
  string agent_id = 1;
  string type = 2;
  repeated string capabilities = 3;
  map<string, string> metadata = 4;
}

message RegistrationResponse {
  bool success = 1;
  string agent_id = 2;
  string message = 3;
}

message MessageRequest {
  string from = 1;
  string to = 2;
  string content = 3;
  map<string, string> headers = 4;
}

message MessageResponse {
  string message_id = 1;
  string from = 2;
  string to = 3;
  string content = 4;
  int64 timestamp = 5;
  bool delivered = 6;
}

message MessagesQuery {
  string agent_id = 1;
  int32 limit = 2;
}

message MessagesList {
  repeated MessageResponse messages = 1;
}

message DiscoveryRequest {
  string type = 1;
  string capability = 2;
}

message AgentInfo {
  string id = 1;
  string type = 2;
  repeated string capabilities = 3;
  int64 registered_at = 4;
}

message AgentsList {
  repeated AgentInfo agents = 1;
}
`;

// 确保proto目录存在并写入文件
const protoDir = dirname(PROTO_PATH);
if (!existsSync(protoDir)) {
  mkdirSync(protoDir, { recursive: true });
}
writeFileSync(PROTO_PATH, protoContent);

// 加载proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const a2aProto = grpc.loadPackageDefinition(packageDefinition).a2a;

// Agent服务实现
class AgentService {
  constructor() {
    this.agents = new Map();
    this.messages = [];
  }

  registerAgent(call, callback) {
    const { agent_id, type, capabilities, metadata } = call.request;
    this.agents.set(agent_id, {
      id: agent_id,
      type,
      capabilities: capabilities || [],
      metadata: metadata || {},
      registered_at: Date.now()
    });
    callback(null, { success: true, agent_id, message: 'Registered successfully' });
  }

  sendMessage(call, callback) {
    const { from, to, content, headers } = call.request;
    const message = {
      message_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from,
      to,
      content,
      timestamp: Date.now(),
      delivered: true
    };
    this.messages.push(message);
    callback(null, message);
  }

  getMessages(call, callback) {
    const { agent_id, limit } = call.request;
    let messages = this.messages.filter(m => m.to === agent_id);
    if (limit > 0) {
      messages = messages.slice(-limit);
    }
    callback(null, { messages });
  }

  discoverAgents(call, callback) {
    const { type, capability } = call.request;
    const agents = Array.from(this.agents.values())
      .filter(agent => {
        if (type && agent.type !== type) return false;
        if (capability && !agent.capabilities?.includes(capability)) return false;
        return true;
      })
      .map(agent => ({
        id: agent.id,
        type: agent.type,
        capabilities: agent.capabilities,
        registered_at: agent.registered_at
      }));
    callback(null, { agents });
  }

  streamMessages(call) {
    call.on('data', (message) => {
      const response = {
        message_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: message.from,
        to: message.to,
        content: message.content,
        timestamp: Date.now(),
        delivered: true
      };
      call.write(response);
    });
    call.on('end', () => {
      call.end();
    });
  }
}

const agentService = new AgentService();

// gRPC 服务端
export function createGRPCServer(port = 50051) {
  const server = new grpc.Server();
  
  server.addService(a2aProto.A2AService.service, {
    registerAgent: agentService.registerAgent.bind(agentService),
    sendMessage: agentService.sendMessage.bind(agentService),
    getMessages: agentService.getMessages.bind(agentService),
    discoverAgents: agentService.discoverAgents.bind(agentService),
    streamMessages: agentService.streamMessages.bind(agentService)
  });

  return new Promise((resolve, reject) => {
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, actualPort) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`gRPC server running on port ${actualPort}`);
        server.start();
        resolve(server);
      }
    );
  });
}

// gRPC 客户端
export class GRPCClient {
  constructor(address = 'localhost:50051') {
    this.client = new a2aProto.A2AService(
      address,
      grpc.credentials.createInsecure()
    );
  }

  async registerAgent(agentId, metadata = {}) {
    return new Promise((resolve, reject) => {
      this.client.registerAgent({
        agent_id: agentId,
        ...metadata
      }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  async sendMessage(from, to, content, headers = {}) {
    return new Promise((resolve, reject) => {
      this.client.sendMessage({
        from,
        to,
        content,
        headers
      }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  async getMessages(agentId, limit = 0) {
    return new Promise((resolve, reject) => {
      this.client.getMessages({
        agent_id: agentId,
        limit
      }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  async discoverAgents(criteria = {}) {
    return new Promise((resolve, reject) => {
      this.client.discoverAgents(criteria, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  streamMessages() {
    return this.client.streamMessages();
  }

  close() {
    this.client.close();
  }
}

// 如果直接运行此文件，启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  createGRPCServer(50051);
}
