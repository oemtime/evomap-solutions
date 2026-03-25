"""
外部知识库整合 - 核心实现
Knowledge Base Integration for Agent Collaboration
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Optional, Any, AsyncIterator, Callable
from datetime import datetime
import asyncio
import hashlib
import json
from collections import defaultdict

import numpy as np
from numpy.typing import NDArray


# ============================================================================
# 数据模型
# ============================================================================

class ShareType(Enum):
    """知识共享类型"""
    BROADCAST = auto()    # 广播给所有 Agent
    TARGETED = auto()     # 定向共享
    REQUEST = auto()      # 请求知识
    RESPONSE = auto()     # 响应请求


class Priority(Enum):
    """优先级"""
    HIGH = 1
    NORMAL = 2
    LOW = 3


class MemoryType(Enum):
    """记忆类型"""
    EPISODIC = auto()     # 情景记忆
    SEMANTIC = auto()     # 语义记忆
    PROCEDURAL = auto()   # 程序记忆


class ResolutionStrategy(Enum):
    """冲突解决策略"""
    TIMESTAMP = auto()    # 时间戳优先
    CONFIDENCE = auto()   # 置信度优先
    AUTHORITY = auto()    # 来源权威度
    MERGE = auto()        # 合并


@dataclass
class KnowledgeChunk:
    """知识块"""
    id: str
    content: str
    embedding: Optional[NDArray] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    source: str = "unknown"
    confidence: float = 1.0
    relevance_score: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
    tags: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        if not self.id:
            self.id = self._generate_id()
    
    def _generate_id(self) -> str:
        content_hash = hashlib.md5(
            f"{self.content}{self.timestamp}".encode()
        ).hexdigest()[:16]
        return f"chunk_{content_hash}"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "embedding": self.embedding.tolist() if self.embedding is not None else None,
            "metadata": self.metadata,
            "source": self.source,
            "confidence": self.confidence,
            "relevance_score": self.relevance_score,
            "timestamp": self.timestamp.isoformat(),
            "tags": self.tags
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "KnowledgeChunk":
        embedding = None
        if data.get("embedding"):
            embedding = np.array(data["embedding"])
        return cls(
            id=data.get("id", ""),
            content=data["content"],
            embedding=embedding,
            metadata=data.get("metadata", {}),
            source=data.get("source", "unknown"),
            confidence=data.get("confidence", 1.0),
            relevance_score=data.get("relevance_score", 0.0),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            tags=data.get("tags", [])
        )


@dataclass
class DecisionContext:
    """决策上下文"""
    agent_id: str
    task_id: str
    decision_type: str
    constraints: Dict[str, Any] = field(default_factory=dict)
    history: List[Dict[str, Any]] = field(default_factory=list)
    top_k: int = 5
    timeout_ms: int = 5000


@dataclass
class ProcessedQuery:
    """处理后的查询"""
    original: str
    rewritten: str
    variations: List[str]
    intent: str
    context: DecisionContext
    entities: List[str] = field(default_factory=list)


@dataclass
class RetrievalResult:
    """检索结果"""
    chunks: List[KnowledgeChunk]
    context: str
    sources_traced: Dict[str, int]
    latency_ms: float = 0.0
    total_chunks_searched: int = 0


@dataclass
class KnowledgeShareMessage:
    """知识共享消息"""
    message_id: str
    sender_id: str
    recipient_ids: List[str]
    knowledge_chunks: List[KnowledgeChunk]
    share_type: ShareType
    ttl: int = 3600
    priority: Priority = Priority.NORMAL
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class AgentInfo:
    """Agent 信息"""
    id: str
    name: str
    capabilities: List[str]
    knowledge_domains: List[str]
    last_seen: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)


# ============================================================================
# 抽象基类
# ============================================================================

class KnowledgeSourceConnector(ABC):
    """知识源连接器抽象基类"""
    
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self._connected = False
    
    @abstractmethod
    async def connect(self) -> bool:
        """建立连接"""
        pass
    
    @abstractmethod
    async def disconnect(self) -> bool:
        """断开连接"""
        pass
    
    @abstractmethod
    async def retrieve(
        self, 
        query: str, 
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[KnowledgeChunk]:
        """检索知识"""
        pass
    
    @abstractmethod
    async def index(self, chunks: List[KnowledgeChunk]) -> bool:
        """索引知识块"""
        pass
    
    async def health_check(self) -> bool:
        """健康检查"""
        return self._connected


class EmbeddingModel(ABC):
    """嵌入模型抽象基类"""
    
    @abstractmethod
    async def embed(self, texts: List[str]) -> List[NDArray]:
        """生成文本嵌入"""
        pass
    
    @property
    @abstractmethod
    def dimension(self) -> int:
        """嵌入维度"""
        pass


# ============================================================================
# 向量存储实现
# ============================================================================

class InMemoryVectorStore:
    """内存向量存储（用于测试和小规模场景）"""
    
    def __init__(self, dimension: int = 1536):
        self.dimension = dimension
        self.chunks: Dict[str, KnowledgeChunk] = {}
        self.embeddings: Dict[str, NDArray] = {}
        self.index: Dict[str, set] = defaultdict(set)  # tag -> chunk_ids
    
    async def add(self, chunks: List[KnowledgeChunk]) -> bool:
        """添加知识块"""
        for chunk in chunks:
            self.chunks[chunk.id] = chunk
            if chunk.embedding is not None:
                self.embeddings[chunk.id] = chunk.embedding
            for tag in chunk.tags:
                self.index[tag].add(chunk.id)
        return True
    
    async def search(
        self, 
        query_embedding: NDArray, 
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[KnowledgeChunk]:
        """相似度搜索"""
        if not self.embeddings:
            return []
        
        scores = []
        for chunk_id, embedding in self.embeddings.items():
            # 应用过滤器
            if filters and not self._matches_filter(chunk_id, filters):
                continue
            
            # 计算余弦相似度
            similarity = self._cosine_similarity(query_embedding, embedding)
            scores.append((chunk_id, similarity))
        
        # 排序并返回 top_k
        scores.sort(key=lambda x: x[1], reverse=True)
        results = []
        for chunk_id, score in scores[:top_k]:
            chunk = self.chunks[chunk_id]
            chunk.relevance_score = score
            results.append(chunk)
        
        return results
    
    def _cosine_similarity(self, a: NDArray, b: NDArray) -> float:
        """计算余弦相似度"""
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    
    def _matches_filter(
        self, 
        chunk_id: str, 
        filters: Dict[str, Any]
    ) -> bool:
        """检查是否匹配过滤器"""
        chunk = self.chunks.get(chunk_id)
        if not chunk:
            return False
        
        for key, value in filters.items():
            if key == "tags":
                if not any(tag in chunk.tags for tag in value):
                    return False
            elif key == "source":
                if chunk.source != value:
                    return False
            elif key == "min_confidence":
                if chunk.confidence < value:
                    return False
        
        return True
    
    async def delete(self, chunk_ids: List[str]) -> bool:
        """删除知识块"""
        for chunk_id in chunk_ids:
            if chunk_id in self.chunks:
                chunk = self.chunks[chunk_id]
                del self.chunks[chunk_id]
                if chunk_id in self.embeddings:
                    del self.embeddings[chunk_id]
                for tag in chunk.tags:
                    self.index[tag].discard(chunk_id)
        return True
    
    async def clear(self) -> bool:
        """清空存储"""
        self.chunks.clear()
        self.embeddings.clear()
        self.index.clear()
        return True


# ============================================================================
# 嵌入模型实现
# ============================================================================

class SimpleEmbeddingModel(EmbeddingModel):
    """简单嵌入模型（基于词频的简化实现，用于测试）"""
    
    def __init__(self, dimension: int = 128):
        self._dimension = dimension
        self.vocab: Dict[str, int] = {}
        self._next_id = 0
    
    async def embed(self, texts: List[str]) -> List[NDArray]:
        """生成文本嵌入"""
        embeddings = []
        for text in texts:
            embedding = self._text_to_embedding(text)
            embeddings.append(embedding)
        return embeddings
    
    def _text_to_embedding(self, text: str) -> NDArray:
        """将文本转换为嵌入向量"""
        words = text.lower().split()
        embedding = np.zeros(self._dimension)
        
        for word in words:
            if word not in self.vocab:
                self.vocab[word] = self._next_id
                self._next_id = (self._next_id + 1) % self._dimension
            
            idx = self.vocab[word]
            embedding[idx] += 1
        
        # 归一化
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        return embedding
    
    @property
    def dimension(self) -> int:
        return self._dimension


# ============================================================================
# RAG 引擎
# ============================================================================

class QueryRewriter:
    """查询重写器"""
    
    def __init__(self):
        self.expansion_templates = [
            "{query} 的定义是什么",
            "{query} 如何工作",
            "{query} 的最佳实践",
            "{query} 常见问题"
        ]
    
    def rewrite(
        self, 
        query: str, 
        context: DecisionContext
    ) -> str:
        """重写查询以提高检索效果"""
        # 简化实现：添加上下文信息
        rewritten = query
        if context.decision_type:
            rewritten = f"[{context.decision_type}] {query}"
        return rewritten
    
    def generate_variations(self, query: str) -> List[str]:
        """生成查询变体"""
        variations = [query]
        for template in self.expansion_templates[:2]:  # 限制变体数量
            variations.append(template.format(query=query))
        return variations


class CrossEncoderReranker:
    """交叉编码器重排序器（简化实现）"""
    
    async def rerank(
        self, 
        query: str, 
        chunks: List[KnowledgeChunk]
    ) -> List[KnowledgeChunk]:
        """重排序检索结果"""
        # 简化实现：基于关键词匹配分数重排序
        query_words = set(query.lower().split())
        
        scored_chunks = []
        for chunk in chunks:
            chunk_words = set(chunk.content.lower().split())
            overlap = len(query_words & chunk_words)
            score = overlap / max(len(query_words), 1)
            scored_chunks.append((chunk, score))
        
        # 按分数排序
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        
        # 更新相关性分数并返回
        results = []
        for chunk, score in scored_chunks:
            chunk.relevance_score = score
            results.append(chunk)
        
        return results


class ContextBuilder:
    """上下文构建器"""
    
    def build(
        self, 
        chunks: List[KnowledgeChunk],
        max_tokens: int = 4000
    ) -> str:
        """构建上下文字符串"""
        context_parts = []
        current_length = 0
        
        for chunk in chunks:
            chunk_text = f"[Source: {chunk.source}]\n{chunk.content}\n\n"
            if current_length + len(chunk_text) > max_tokens:
                break
            context_parts.append(chunk_text)
            current_length += len(chunk_text)
        
        return "".join(context_parts)


class RAGEngine:
    """RAG 引擎"""
    
    def __init__(
        self,
        embedding_model: Optional[EmbeddingModel] = None,
        vector_store: Optional[InMemoryVectorStore] = None
    ):
        self.embedding_model = embedding_model or SimpleEmbeddingModel()
        self.vector_store = vector_store or InMemoryVectorStore(
            dimension=self.embedding_model.dimension
        )
        self.query_rewriter = QueryRewriter()
        self.reranker = CrossEncoderReranker()
        self.context_builder = ContextBuilder()
        self.retrieval_history: List[RetrievalResult] = []
    
    async def retrieve(
        self,
        query: str,
        context: DecisionContext,
        top_k: int = 5
    ) -> RetrievalResult:
        """执行 RAG 检索"""
        import time
        start_time = time.time()
        
        # 1. 重写查询
        rewritten = self.query_rewriter.rewrite(query, context)
        
        # 2. 生成嵌入
        embeddings = await self.embedding_model.embed([rewritten])
        query_embedding = embeddings[0]
        
        # 3. 向量检索
        chunks = await self.vector_store.search(
            query_embedding, 
            top_k=top_k * 2  # 检索更多用于重排序
        )
        
        total_chunks = len(chunks)
        
        # 4. 重排序
        reranked = await self.reranker.rerank(query, chunks)
        
        # 5. 选择 top_k
        selected = reranked[:top_k]
        
        # 6. 构建上下文
        context_str = self.context_builder.build(selected)
        
        # 7. 追踪来源
        sources_traced = defaultdict(int)
        for chunk in selected:
            sources_traced[chunk.source] += 1
        
        latency = (time.time() - start_time) * 1000
        
        result = RetrievalResult(
            chunks=selected,
            context=context_str,
            sources_traced=dict(sources_traced),
            latency_ms=latency,
            total_chunks_searched=total_chunks
        )
        
        self.retrieval_history.append(result)
        return result
    
    async def index_documents(
        self, 
        documents: List[str],
        source: str = "unknown"
    ) -> List[str]:
        """索引文档"""
        # 1. 分割文档
        chunks = self._chunk_documents(documents, source)
        
        # 2. 生成嵌入
        texts = [chunk.content for chunk in chunks]
        embeddings = await self.embedding_model.embed(texts)
        
        # 3. 关联嵌入
        for chunk, embedding in zip(chunks, embeddings):
            chunk.embedding = embedding
        
        # 4. 存储
        await self.vector_store.add(chunks)
        
        return [chunk.id for chunk in chunks]
    
    def _chunk_documents(
        self, 
        documents: List[str], 
        source: str,
        chunk_size: int = 500,
        overlap: int = 50
    ) -> List[KnowledgeChunk]:
        """将文档分割成块"""
        chunks = []
        
        for doc in documents:
            # 简化实现：按字符分割
            for i in range(0, len(doc), chunk_size - overlap):
                chunk_text = doc[i:i + chunk_size]
                if len(chunk_text) < 50:  # 跳过太短的块
                    continue
                
                chunk = KnowledgeChunk(
                    content=chunk_text,
                    source=source,
                    metadata={"position": i}
                )
                chunks.append(chunk)
        
        return chunks


# ============================================================================
# Agent 注册与发现
# ============================================================================

class AgentRegistry:
    """Agent 注册表"""
    
    def __init__(self):
        self.agents: Dict[str, AgentInfo] = {}
        self.domain_index: Dict[str, set] = defaultdict(set)
        self.capability_index: Dict[str, set] = defaultdict(set)
    
    def register(self, agent_info: AgentInfo) -> bool:
        """注册 Agent"""
        self.agents[agent_info.id] = agent_info
        
        # 更新索引
        for domain in agent_info.knowledge_domains:
            self.domain_index[domain].add(agent_info.id)
        for cap in agent_info.capabilities:
            self.capability_index[cap].add(agent_info.id)
        
        return True
    
    def unregister(self, agent_id: str) -> bool:
        """注销 Agent"""
        if agent_id not in self.agents:
            return False
        
        agent = self.agents[agent_id]
        
        # 更新索引
        for domain in agent.knowledge_domains:
            self.domain_index[domain].discard(agent_id)
        for cap in agent.capabilities:
            self.capability_index[cap].discard(agent_id)
        
        del self.agents[agent_id]
        return True
    
    def discover(
        self,
        domains: Optional[List[str]] = None,
        capabilities: Optional[List[str]] = None
    ) -> List[AgentInfo]:
        """发现符合条件的 Agent"""
        candidates = set(self.agents.keys())
        
        if domains:
            domain_matches = set()
            for domain in domains:
                domain_matches.update(self.domain_index.get(domain, set()))
            candidates &= domain_matches
        
        if capabilities:
            cap_matches = set()
            for cap in capabilities:
                cap_matches.update(self.capability_index.get(cap, set()))
            candidates &= cap_matches
        
        return [self.agents[aid] for aid in candidates]
    
    def get_agent(self, agent_id: str) -> Optional[AgentInfo]:
        """获取 Agent 信息"""
        return self.agents.get(agent_id)
    
    def update_heartbeat(self, agent_id: str) -> bool:
        """更新心跳"""
        if agent_id in self.agents:
            self.agents[agent_id].last_seen = datetime.now()
            return True
        return False


# ============================================================================
# 知识协调器
# ============================================================================

class KnowledgeCoordinator:
    """知识协调器 - 中央协调组件"""
    
    def __init__(self):
        self.agent_registry = AgentRegistry()
        self.rag_engine = RAGEngine()
        self.message_queue: asyncio.Queue = asyncio.Queue()
        self.shared_knowledge: InMemoryVectorStore = InMemoryVectorStore()
        self.share_handlers: List[Callable] = []
        self._running = False
    
    async def start(self):
        """启动协调器"""
        self._running = True
        asyncio.create_task(self._process_message_queue())
    
    async def stop(self):
        """停止协调器"""
        self._running = False
    
    async def register_agent(self, agent_info: AgentInfo) -> bool:
        """注册 Agent"""
        return self.agent_registry.register(agent_info)
    
    async def retrieve_for_decision(
        self,
        query: str,
        agent_id: str,
        context: DecisionContext
    ) -> RetrievalResult:
        """为决策检索知识"""
        # 1. 从共享知识库检索
        shared_result = await self.rag_engine.retrieve(
            query, context, top_k=context.top_k
        )
        
        # 2. 可以在这里添加从其他 Agent 请求知识的逻辑
        
        return shared_result
    
    async def share_knowledge(
        self,
        sender_id: str,
        knowledge: List[KnowledgeChunk],
        share_type: ShareType = ShareType.BROADCAST,
        target_agents: Optional[List[str]] = None
    ) -> bool:
        """共享知识"""
        if share_type == ShareType.BROADCAST:
            # 广播给所有 Agent
            agents = self.agent_registry.discover()
            recipient_ids = [a.id for a in agents if a.id != sender_id]
        else:
            recipient_ids = target_agents or []
        
        message = KnowledgeShareMessage(
            message_id=self._generate_message_id(),
            sender_id=sender_id,
            recipient_ids=recipient_ids,
            knowledge_chunks=knowledge,
            share_type=share_type
        )
        
        # 添加到消息队列
        await self.message_queue.put(message)
        
        # 同时索引到共享知识库
        await self.rag_engine.vector_store.add(knowledge)
        
        return True
    
    async def request_knowledge(
        self,
        requester_id: str,
        query: str,
        target_agents: Optional[List[str]] = None
    ) -> List[KnowledgeChunk]:
        """请求知识"""
        if not target_agents:
            # 发现可能拥有相关知识的 Agent
            agents = self.agent_registry.discover()
            target_agents = [a.id for a in agents if a.id != requester_id]
        
        # 创建请求消息
        message = KnowledgeShareMessage(
            message_id=self._generate_message_id(),
            sender_id=requester_id,
            recipient_ids=target_agents,
            knowledge_chunks=[],
            share_type=ShareType.REQUEST
        )
        
        await self.message_queue.put(message)
        
        # 简化实现：直接返回空列表，实际应该等待响应
        return []
    
    def _generate_message_id(self) -> str:
        """生成消息 ID"""
        timestamp = datetime.now().isoformat()
        hash_str = hashlib.md5(timestamp.encode()).hexdigest()[:12]
        return f"msg_{hash_str}"
    
    async def _process_message_queue(self):
        """处理消息队列"""
        while self._running:
            try:
                message = await asyncio.wait_for(
                    self.message_queue.get(), 
                    timeout=1.0
                )
                await self._handle_message(message)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"Error processing message: {e}")
    
    async def _handle_message(self, message: KnowledgeShareMessage):
        """处理消息"""
        if message.share_type == ShareType.BROADCAST:
            # 广播消息处理
            for handler in self.share_handlers:
                await handler(message)
        
        elif message.share_type == ShareType.REQUEST:
            # 知识请求处理
            pass
        
        elif message.share_type == ShareType.RESPONSE:
            # 知识响应处理
            pass
    
    def add_share_handler(self, handler: Callable):
        """添加共享处理器"""
        self.share_handlers.append(handler)


# ============================================================================
# OpenClaw 记忆集成
# ============================================================================

class OpenClawMemoryAdapter:
    """OpenClaw 记忆系统适配器"""
    
    def __init__(self, gateway_url: str = "http://localhost:8080"):
        self.gateway_url = gateway_url
        self.local_cache: Dict[str, Any] = {}
    
    async def retrieve(
        self,
        query: str,
        limit: int = 5,
        include_stm: bool = True,
        include_ltm: bool = True
    ) -> List[Dict[str, Any]]:
        """从 OpenClaw 记忆系统检索"""
        # 简化实现：返回模拟数据
        # 实际实现应该调用 OpenClaw API
        memories = []
        
        if include_stm:
            memories.extend(self._get_stm_memories(query, limit))
        
        if include_ltm:
            memories.extend(self._get_ltm_memories(query, limit))
        
        return memories[:limit]
    
    async def store(
        self,
        entry: Dict[str, Any],
        memory_type: MemoryType = MemoryType.EPISODIC,
        importance: float = 1.0
    ) -> bool:
        """存储到 OpenClaw 记忆系统"""
        # 简化实现
        entry_id = hashlib.md5(
            json.dumps(entry, sort_keys=True).encode()
        ).hexdigest()[:16]
        
        self.local_cache[entry_id] = {
            **entry,
            "memory_type": memory_type.name,
            "importance": importance,
            "timestamp": datetime.now().isoformat()
        }
        
        return True
    
    def _get_stm_memories(
        self, 
        query: str, 
        limit: int
    ) -> List[Dict[str, Any]]:
        """获取短期记忆"""
        # 模拟实现
        return [
            {
                "id": f"stm_{i}",
                "content": f"Short-term memory related to: {query}",
                "type": "stm",
                "timestamp": datetime.now().isoformat()
            }
            for i in range(min(2, limit))
        ]
    
    def _get_ltm_memories(
        self, 
        query: str, 
        limit: int
    ) -> List[Dict[str, Any]]:
        """获取长期记忆"""
        # 模拟实现
        return [
            {
                "id": f"ltm_{i}",
                "content": f"Long-term knowledge about: {query}",
                "type": "ltm",
                "timestamp": datetime.now().isoformat()
            }
            for i in range(min(3, limit))
        ]


class KnowledgeMemoryBridge:
    """知识与记忆桥梁"""
    
    def convert_memory(self, memory: Dict[str, Any]) -> KnowledgeChunk:
        """将记忆转换为知识块"""
        return KnowledgeChunk(
            content=memory.get("content", ""),
            source=f"openclaw_{memory.get('type', 'memory')}",
            metadata={
                "memory_id": memory.get("id"),
                "memory_type": memory.get("type"),
                "original_timestamp": memory.get("timestamp")
            },
            timestamp=datetime.now()
        )
    
    def convert_knowledge(
        self, 
        chunk: KnowledgeChunk
    ) -> Dict[str, Any]:
        """将知识块转换为记忆"""
        return {
            "content": chunk.content,
            "source": chunk.source,
            "confidence": chunk.confidence,
            "tags": chunk.tags,
            "metadata": chunk.metadata
        }


class OpenClawMemoryIntegration:
    """OpenClaw 记忆系统集成器"""
    
    def __init__(
        self,
        gateway_url: str = "http://localhost:8080"
    ):
        self.memory_adapter = OpenClawMemoryAdapter(gateway_url)
        self.knowledge_bridge = KnowledgeMemoryBridge()
        self.sync_history: List[Dict[str, Any]] = []
    
    async def memory_to_knowledge(
        self,
        query: str = "",
        limit: int = 10
    ) -> List[KnowledgeChunk]:
        """将 OpenClaw 记忆转换为知识"""
        # 1. 检索记忆
        memories = await self.memory_adapter.retrieve(
            query=query,
            limit=limit,
            include_stm=True,
            include_ltm=True
        )
        
        # 2. 转换为知识块
        knowledge_chunks = []
        for memory in memories:
            chunk = self.knowledge_bridge.convert_memory(memory)
            knowledge_chunks.append(chunk)
        
        return knowledge_chunks
    
    async def knowledge_to_memory(
        self,
        knowledge: List[KnowledgeChunk],
        memory_type: MemoryType = MemoryType.EPISODIC
    ) -> List[str]:
        """将知识同步到 OpenClaw 记忆"""
        memory_ids = []
        
        for chunk in knowledge:
            memory_entry = self.knowledge_bridge.convert_knowledge(chunk)
            success = await self.memory_adapter.store(
                entry=memory_entry,
                memory_type=memory_type,
                importance=chunk.relevance_score
            )
            if success:
                memory_ids.append(chunk.id)
        
        return memory_ids
    
    async def bidirectional_sync(
        self,
        query: str = "",
        sync_to_memory: bool = True,
        sync_from_memory: bool = True
    ) -> Dict[str, Any]:
        """双向同步"""
        result = {
            "to_memory": [],
            "from_memory": [],
            "timestamp": datetime.now().isoformat()
        }
        
        if sync_from_memory:
            # 从记忆同步到知识
            knowledge = await self.memory_to_knowledge(query)
            result["from_memory"] = [k.id for k in knowledge]
        
        if sync_to_memory:
            # 从知识同步到记忆
            # 这里需要传入实际的知识列表
            pass
        
        self.sync_history.append(result)
        return result


# ============================================================================
# 冲突解决
# ============================================================================

class ConflictResolver:
    """知识冲突解决器"""
    
    def __init__(
        self, 
        strategy: ResolutionStrategy = ResolutionStrategy.TIMESTAMP
    ):
        self.strategy = strategy
    
    def resolve(
        self,
        memory_knowledge: KnowledgeChunk,
        external_knowledge: KnowledgeChunk
    ) -> KnowledgeChunk:
        """解决知识冲突"""
        if self.strategy == ResolutionStrategy.TIMESTAMP:
            return self._resolve_by_timestamp(
                memory_knowledge, 
                external_knowledge
            )
        elif self.strategy == ResolutionStrategy.CONFIDENCE:
            return self._resolve_by_confidence(
                memory_knowledge, 
                external_knowledge
            )
        elif self.strategy == ResolutionStrategy.MERGE:
            return self._merge_knowledge(
                memory_knowledge, 
                external_knowledge
            )
        else:
            return external_knowledge  # 默认返回外部知识
    
    def _resolve_by_timestamp(
        self,
        memory_knowledge: KnowledgeChunk,
        external_knowledge: KnowledgeChunk
    ) -> KnowledgeChunk:
        """按时间戳解决"""
        if memory_knowledge.timestamp > external_knowledge.timestamp:
            return memory_knowledge
        return external_knowledge
    
    def _resolve_by_confidence(
        self,
        memory_knowledge: KnowledgeChunk,
        external_knowledge: KnowledgeChunk
    ) -> KnowledgeChunk:
        """按置信度解决"""
        if memory_knowledge.confidence > external_knowledge.confidence:
            return memory_knowledge
        return external_knowledge
    
    def _merge_knowledge(
        self,
        memory_knowledge: KnowledgeChunk,
        external_knowledge: KnowledgeChunk
    ) -> KnowledgeChunk:
        """合并知识"""
        merged_content = f"{memory_knowledge.content}\n\n{external_knowledge.content}"
        merged_confidence = max(
            memory_knowledge.confidence, 
            external_knowledge.confidence
        )
        
        return KnowledgeChunk(
            content=merged_content,
            source=f"merged:{memory_knowledge.source}+{external_knowledge.source}",
            confidence=merged_confidence,
            metadata={
                "merged_from": [memory_knowledge.id, external_knowledge.id],
                **memory_knowledge.metadata,
                **external_knowledge.metadata
            }
        )


# ============================================================================
# 导出
# ============================================================================

__all__ = [
    # 枚举
    "ShareType",
    "Priority", 
    "MemoryType",
    "ResolutionStrategy",
    
    # 数据模型
    "KnowledgeChunk",
    "DecisionContext",
    "ProcessedQuery",
    "RetrievalResult",
    "KnowledgeShareMessage",
    "AgentInfo",
    
    # 抽象基类
    "KnowledgeSourceConnector",
    "EmbeddingModel",
    
    # 核心实现
    "InMemoryVectorStore",
    "SimpleEmbeddingModel",
    "QueryRewriter",
    "CrossEncoderReranker",
    "ContextBuilder",
    "RAGEngine",
    "AgentRegistry",
    "KnowledgeCoordinator",
    
    # OpenClaw 集成
    "OpenClawMemoryAdapter",
    "KnowledgeMemoryBridge",
    "OpenClawMemoryIntegration",
    
    # 冲突解决
    "ConflictResolver",
]
