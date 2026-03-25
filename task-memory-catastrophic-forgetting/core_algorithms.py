"""
Agent长期记忆灾难性遗忘解决方案 - 核心算法实现
Core Algorithms for Agent Long-Term Memory Catastrophic Forgetting Solution

作者: Oliver (omega-bot)
任务ID: cm227eecb55f9af60dc67d4c5
"""

import json
import math
import hashlib
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import defaultdict
import numpy as np
from abc import ABC, abstractmethod

# ============================================================================
# 1. 数据模型定义
# ============================================================================

class MemoryLevel(Enum):
    """记忆层级"""
    SENSORY = "sensory"      # 感官记忆
    SHORT_TERM = "stm"       # 短期记忆
    MEDIUM_TERM = "mtm"      # 中期记忆
    LONG_TERM = "ltm"        # 长期记忆

class MemoryType(Enum):
    """记忆类型"""
    CONVERSATION = "conversation"
    TASK = "task"
    FACT = "fact"
    PROCEDURE = "procedure"
    PREFERENCE = "preference"
    EPISODE = "episode"

@dataclass
class MemoryItem:
    """记忆项基础类"""
    id: str
    content: str
    level: MemoryLevel
    type: MemoryType
    timestamp: datetime
    vector: Optional[np.ndarray] = None
    metadata: Dict = field(default_factory=dict)
    
    # 记忆属性
    importance: float = 0.5  # 重要性 0-1
    emotional_valence: float = 0.0  # 情感值 -1到1
    
    # 访问统计
    access_count: int = 0
    last_accessed: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)
    
    # 巩固相关
    review_count: int = 0
    next_review: Optional[datetime] = None
    stability: float = 1.0  # 记忆稳定性
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        data = asdict(self)
        if self.vector is not None:
            data['vector'] = self.vector.tolist()
        data['timestamp'] = self.timestamp.isoformat()
        data['created_at'] = self.created_at.isoformat()
        if self.last_accessed:
            data['last_accessed'] = self.last_accessed.isoformat()
        if self.next_review:
            data['next_review'] = self.next_review.isoformat()
        data['level'] = self.level.value
        data['type'] = self.type.value
        return data
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'MemoryItem':
        """从字典创建"""
        data = data.copy()
        if 'vector' in data and data['vector']:
            data['vector'] = np.array(data['vector'])
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        data['created_at'] = datetime.fromisoformat(data['created_at'])
        if data.get('last_accessed'):
            data['last_accessed'] = datetime.fromisoformat(data['last_accessed'])
        if data.get('next_review'):
            data['next_review'] = datetime.fromisoformat(data['next_review'])
        data['level'] = MemoryLevel(data['level'])
        data['type'] = MemoryType(data['type'])
        return cls(**data)


@dataclass
class Episode:
    """情节记忆"""
    episode_id: str
    summary: str
    key_entities: List[str]
    start_time: datetime
    end_time: datetime
    importance_score: float
    memory_items: List[str] = field(default_factory=list)  # 关联的记忆ID
    
    def duration(self) -> timedelta:
        return self.end_time - self.start_time


@dataclass
class ConsolidationTask:
    """巩固任务"""
    task_id: str
    source_level: MemoryLevel
    target_level: MemoryLevel
    memory_ids: List[str]
    priority: float
    created_at: datetime
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# ============================================================================
# 2. 向量编码器 (简化版，实际使用Sentence-BERT)
# ============================================================================

class VectorEncoder:
    """
    向量编码器
    实际实现应使用Sentence-BERT或类似模型
    这里使用简化的哈希编码作为演示
    """
    
    def __init__(self, dimension: int = 384):
        self.dimension = dimension
        self._cache = {}
    
    def encode(self, text: str) -> np.ndarray:
        """将文本编码为向量"""
        # 使用缓存
        if text in self._cache:
            return self._cache[text]
        
        # 简化的编码：基于词频的伪向量
        # 实际应使用预训练语言模型
        words = text.lower().split()
        vector = np.zeros(self.dimension)
        
        for word in words:
            # 使用哈希生成伪向量
            hash_val = int(hashlib.md5(word.encode()).hexdigest(), 16)
            for i in range(self.dimension):
                vector[i] += (hash_val >> (i % 32)) & 1
        
        # 归一化
        norm = np.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
        
        self._cache[text] = vector
        return vector
    
    def encode_batch(self, texts: List[str]) -> np.ndarray:
        """批量编码"""
        return np.array([self.encode(t) for t in texts])
    
    def similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """计算余弦相似度"""
        return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2) + 1e-8)


# ============================================================================
# 3. 三层记忆管理器
# ============================================================================

class ShortTermMemory:
    """
    短期记忆管理器
    - 基于固定容量的循环缓冲区
    - 支持快速读写
    - 自动溢出到中期记忆
    """
    
    def __init__(self, capacity: int = 100, encoder: Optional[VectorEncoder] = None):
        self.capacity = capacity
        self.items: List[MemoryItem] = []
        self.encoder = encoder or VectorEncoder()
        self.context_window: List[Dict] = []  # 当前会话上下文
        
    def add(self, content: str, type: MemoryType = MemoryType.CONVERSATION, 
            importance: float = 0.5, metadata: Optional[Dict] = None) -> MemoryItem:
        """添加记忆到短期记忆"""
        
        # 创建记忆项
        item = MemoryItem(
            id=self._generate_id(),
            content=content,
            level=MemoryLevel.SHORT_TERM,
            type=type,
            timestamp=datetime.now(),
            vector=self.encoder.encode(content),
            metadata=metadata or {},
            importance=importance
        )
        
        # 添加到缓冲区
        self.items.append(item)
        
        # 检查容量，溢出时返回待转移项
        overflow = None
        if len(self.items) > self.capacity:
            overflow = self.items.pop(0)
            overflow.level = MemoryLevel.MEDIUM_TERM
        
        return item, overflow
    
    def get_context(self, n: int = 10) -> List[MemoryItem]:
        """获取最近的n条记忆作为上下文"""
        return self.items[-n:]
    
    def get_all(self) -> List[MemoryItem]:
        """获取所有短期记忆"""
        return self.items.copy()
    
    def clear(self) -> List[MemoryItem]:
        """清空短期记忆，返回所有项用于巩固"""
        items = self.items
        self.items = []
        return items
    
    def _generate_id(self) -> str:
        """生成唯一ID"""
        return f"stm_{int(time.time() * 1000)}_{hashlib.md5(str(time.time()).encode()).hexdigest()[:8]}"
    
    def get_usage_ratio(self) -> float:
        """获取使用率"""
        return len(self.items) / self.capacity


class MediumTermMemory:
    """
    中期记忆管理器
    - 基于向量存储
    - 支持语义检索
    - 自动摘要和压缩
    """
    
    def __init__(self, encoder: Optional[VectorEncoder] = None):
        self.items: Dict[str, MemoryItem] = {}
        self.episodes: Dict[str, Episode] = {}
        self.encoder = encoder or VectorEncoder()
        self.consolidation_queue: List[str] = []
        
    def add(self, item: MemoryItem) -> str:
        """添加记忆到中期记忆"""
        item.level = MemoryLevel.MEDIUM_TERM
        self.items[item.id] = item
        
        # 添加到巩固队列
        if item.importance > 0.7:
            self.consolidation_queue.append(item.id)
        
        return item.id
    
    def add_batch(self, items: List[MemoryItem]) -> List[str]:
        """批量添加"""
        ids = []
        for item in items:
            ids.append(self.add(item))
        return ids
    
    def search(self, query: str, top_k: int = 5) -> List[Tuple[MemoryItem, float]]:
        """语义搜索"""
        query_vec = self.encoder.encode(query)
        
        results = []
        for item in self.items.values():
            if item.vector is not None:
                sim = self.encoder.similarity(query_vec, item.vector)
                results.append((item, sim))
        
        # 按相似度排序
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]
    
    def search_by_time(self, start: datetime, end: datetime) -> List[MemoryItem]:
        """按时间范围搜索"""
        return [
            item for item in self.items.values()
            if start <= item.timestamp <= end
        ]
    
    def create_episode(self, summary: str, key_entities: List[str],
                       memory_ids: List[str], importance: float = 0.5) -> Episode:
        """创建情节记忆"""
        episode = Episode(
            episode_id=f"ep_{int(time.time() * 1000)}",
            summary=summary,
            key_entities=key_entities,
            start_time=min(self.items[mid].timestamp for mid in memory_ids if mid in self.items),
            end_time=max(self.items[mid].timestamp for mid in memory_ids if mid in self.items),
            importance_score=importance,
            memory_items=memory_ids
        )
        self.episodes[episode.episode_id] = episode
        return episode
    
    def get_consolidation_candidates(self, threshold: int = 10) -> List[str]:
        """获取待巩固的候选记忆"""
        candidates = self.consolidation_queue[:threshold]
        self.consolidation_queue = self.consolidation_queue[threshold:]
        return candidates
    
    def get_all(self) -> List[MemoryItem]:
        """获取所有中期记忆"""
        return list(self.items.values())
    
    def get_item(self, item_id: str) -> Optional[MemoryItem]:
        """获取特定记忆项"""
        return self.items.get(item_id)


class LongTermMemory:
    """
    长期记忆管理器
    - 结构化知识存储
    - 知识图谱组织
    - 支持推理和泛化
    """
    
    def __init__(self):
        self.knowledge_graph: Dict = {
            "entities": {},
            "relations": []
        }
        self.consolidated_episodes: Dict[str, Episode] = {}
        self.user_profile: Dict = {
            "preferences": {},
            "facts": {},
            "interaction_patterns": []
        }
        self.skill_library: Dict = {}
        self.experience_rules: List[Dict] = []
        self.facts: Dict[str, str] = {}
        
    def store_knowledge(self, category: str, key: str, value: Any, 
                       confidence: float = 1.0):
        """存储知识"""
        if category not in self.knowledge_graph["entities"]:
            self.knowledge_graph["entities"][category] = {}
        
        self.knowledge_graph["entities"][category][key] = {
            "value": value,
            "confidence": confidence,
            "timestamp": datetime.now().isoformat()
        }
    
    def store_fact(self, key: str, value: str, confidence: float = 1.0):
        """存储事实"""
        self.facts[key] = {
            "value": value,
            "confidence": confidence,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_fact(self, key: str) -> Optional[str]:
        """获取事实"""
        if key in self.facts:
            return self.facts[key]["value"]
        return None
    
    def add_relation(self, entity1: str, relation: str, entity2: str, 
                     confidence: float = 1.0):
        """添加知识图谱关系"""
        self.knowledge_graph["relations"].append({
            "source": entity1,
            "relation": relation,
            "target": entity2,
            "confidence": confidence,
            "timestamp": datetime.now().isoformat()
        })
    
    def query_knowledge(self, category: str, key: Optional[str] = None) -> Any:
        """查询知识"""
        if category in self.knowledge_graph["entities"]:
            if key:
                return self.knowledge_graph["entities"][category].get(key)
            return self.knowledge_graph["entities"][category]
        return None
    
    def update_user_profile(self, key: str, value: Any):
        """更新用户画像"""
        self.user_profile["preferences"][key] = {
            "value": value,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_user_profile(self, key: Optional[str] = None) -> Any:
        """获取用户画像"""
        if key:
            pref = self.user_profile["preferences"].get(key)
            return pref["value"] if pref else None
        return self.user_profile
    
    def add_experience_rule(self, condition: str, action: str, 
                           success_rate: float = 1.0):
        """添加经验规则"""
        self.experience_rules.append({
            "condition": condition,
            "action": action,
            "success_rate": success_rate,
            "created_at": datetime.now().isoformat()
        })
    
    def consolidate_episode(self, episode: Episode, summary: str):
        """巩固情节到长期记忆"""
        episode.summary = summary
        self.consolidated_episodes[episode.episode_id] = episode
        
        # 提取知识
        for entity in episode.key_entities:
            self.store_knowledge("episodes", entity, summary)
    
    def export(self) -> Dict:
        """导出长期记忆"""
        return {
            "knowledge_graph": self.knowledge_graph,
            "user_profile": self.user_profile,
            "facts": self.facts,
            "experience_rules": self.experience_rules,
            "consolidated_episodes": {
                k: {
                    "episode_id": v.episode_id,
                    "summary": v.summary,
                    "key_entities": v.key_entities,
                    "importance_score": v.importance_score
                }
                for k, v in self.consolidated_episodes.items()
            }
        }


# ============================================================================
# 4. 遗忘曲线模型
# ============================================================================

class ForgettingCurveModel:
    """
    基于艾宾浩斯遗忘曲线的记忆强度计算
    
    艾宾浩斯遗忘曲线: R = e^(-t/S)
    R: 记忆保留率
    t: 时间
    S: 记忆稳定性
    """
    
    def __init__(self, base_stability: float = 86400):  # 默认1天
        self.base_stability = base_stability
        
    def calculate_retrievability(self, item: MemoryItem, 
                                  current_time: Optional[datetime] = None) -> float:
        """
        计算记忆的可检索性
        
        Returns:
            0-1之间的值，1表示完全可检索，0表示完全遗忘
        """
        if current_time is None:
            current_time = datetime.now()
        
        time_elapsed = (current_time - item.last_accessed).total_seconds() \
                       if item.last_accessed else \
                       (current_time - item.created_at).total_seconds()
        
        # 基础遗忘曲线
        base_retrievability = math.exp(-time_elapsed / item.stability)
        
        # 复习次数奖励
        review_bonus = 1 + 0.15 * item.review_count
        
        # 重要性加权
        importance_weight = 0.5 + 0.5 * item.importance
        
        # 访问频率奖励
        access_bonus = min(1 + 0.05 * item.access_count, 2.0)
        
        retrievability = min(base_retrievability * review_bonus * 
                            importance_weight * access_bonus, 1.0)
        
        return retrievability
    
    def update_stability(self, item: MemoryItem, recall_success: bool):
        """
        更新记忆稳定性
        
        成功回忆增强稳定性，失败降低稳定性
        """
        if recall_success:
            # 成功回忆：稳定性增加 10-50%
            increase = 0.1 + 0.4 * item.importance
            item.stability *= (1 + increase)
            item.review_count += 1
        else:
            # 失败回忆：稳定性降低
            item.stability *= 0.9
        
        return item.stability
    
    def calculate_optimal_review_interval(self, item: MemoryItem) -> timedelta:
        """计算最佳复习间隔"""
        # 基于SM-2算法的简化版
        base_interval = 86400  # 1天
        
        if item.review_count == 0:
            interval = base_interval
        elif item.review_count == 1:
            interval = base_interval * 3
        else:
            interval = base_interval * (item.review_count ** 2)
        
        # 根据重要性调整
        interval *= (0.5 + item.importance)
        
        # 根据稳定性调整
        interval *= (item.stability / self.base_stability)
        
        return timedelta(seconds=min(interval, 86400 * 365))  # 最大1年


# ============================================================================
# 5. 间隔重复调度器
# ============================================================================

class RehearsalScheduler:
    """
    基于间隔重复的记忆强化调度器
    实现类似Anki/SuperMemo的复习算法
    """
    
    def __init__(self, forgetting_model: Optional[ForgettingCurveModel] = None):
        self.model = forgetting_model or ForgettingCurveModel()
        self.schedule: Dict[str, datetime] = {}  # memory_id -> next_review
        self.review_history: Dict[str, List[Dict]] = defaultdict(list)
        
    def schedule_review(self, item: MemoryItem) -> datetime:
        """安排下次复习时间"""
        interval = self.model.calculate_optimal_review_interval(item)
        next_review = datetime.now() + interval
        
        item.next_review = next_review
        self.schedule[item.id] = next_review
        
        return next_review
    
    def get_due_reviews(self, limit: int = 20) -> List[str]:
        """获取到期的复习任务"""
        now = datetime.now()
        due = [
            mid for mid, due_time in self.schedule.items()
            if due_time <= now
        ]
        return due[:limit]
    
    def record_review(self, item: MemoryItem, recall_success: bool, 
                     difficulty: Optional[float] = None):
        """记录复习结果"""
        # 更新稳定性
        self.model.update_stability(item, recall_success)
        
        # 记录历史
        self.review_history[item.id].append({
            "timestamp": datetime.now().isoformat(),
            "success": recall_success,
            "difficulty": difficulty
        })
        
        # 重新安排
        if recall_success:
            self.schedule_review(item)
        else:
            # 失败时缩短间隔
            item.next_review = datetime.now() + timedelta(hours=1)
            self.schedule[item.id] = item.next_review
    
    def get_review_stats(self, item_id: str) -> Dict:
        """获取复习统计"""
        history = self.review_history.get(item_id, [])
        if not history:
            return {"total": 0, "success_rate": 0}
        
        successes = sum(1 for h in history if h["success"])
        return {
            "total": len(history),
            "successes": successes,
            "failures": len(history) - successes,
            "success_rate": successes / len(history)
        }


# ============================================================================
# 6. 记忆巩固引擎
# ============================================================================

class ConsolidationEngine:
    """
    记忆巩固引擎
    负责将短期/中期记忆转化为长期记忆
    """
    
    def __init__(self,
                 stm: ShortTermMemory,
                 mtm: MediumTermMemory,
                 ltm: LongTermMemory,
                 encoder: Optional[VectorEncoder] = None):
        self.stm = stm
        self.mtm = mtm
        self.ltm = ltm
        self.encoder = encoder or VectorEncoder()
        self.forgetting_model = ForgettingCurveModel()
        
    def consolidate_stm_to_mtm(self, force: bool = False) -> List[str]:
        """
        将短期记忆巩固到中期记忆
        
        Returns:
            转移的记忆ID列表
        """
        # 检查触发条件
        if not force and self.stm.get_usage_ratio() < 0.8:
            return []
        
        # 获取待转移的记忆
        items_to_transfer = self.stm.clear() if force else []
        if not items_to_transfer:
            # 只转移最不重要的部分
            all_items = self.stm.get_all()
            threshold = int(len(all_items) * 0.3)
            items_to_transfer = sorted(all_items, key=lambda x: x.importance)[:threshold]
            # 从STM移除
            for item in items_to_transfer:
                if item in self.stm.items:
                    self.stm.items.remove(item)
        
        # 转移到MTM
        transferred_ids = []
        for item in items_to_transfer:
            item.level = MemoryLevel.MEDIUM_TERM
            self.mtm.add(item)
            transferred_ids.append(item.id)
        
        return transferred_ids
    
    def consolidate_mtm_to_ltm(self, candidate_ids: Optional[List[str]] = None) -> Dict:
        """
        将中期记忆巩固到长期记忆
        
        Returns:
            巩固结果统计
        """
        if candidate_ids is None:
            candidate_ids = self.mtm.get_consolidation_candidates(20)
        
        results = {
            "processed": 0,
            "consolidated": 0,
            "summarized": 0,
            "entities_extracted": 0
        }
        
        for item_id in candidate_ids:
            item = self.mtm.get_item(item_id)
            if not item:
                continue
            
            results["processed"] += 1
            
            # 检查可检索性
            retrievability = self.forgetting_model.calculate_retrievability(item)
            
            # 高重要性或高可检索性的记忆进行巩固
            if item.importance > 0.7 or retrievability > 0.5:
                self._consolidate_item(item)
                results["consolidated"] += 1
                
                # 提取实体和关系
                entities = self._extract_entities(item.content)
                for entity in entities:
                    self.ltm.store_knowledge("entities", entity, item.content)
                    results["entities_extracted"] += 1
                
                # 更新用户画像（如果是偏好相关）
                if item.type == MemoryType.PREFERENCE:
                    self._extract_preference(item)
        
        return results
    
    def _consolidate_item(self, item: MemoryItem):
        """巩固单个记忆项"""
        # 生成摘要
        summary = self._generate_summary(item.content)
        
        # 存储到长期记忆
        self.ltm.store_knowledge(
            "consolidated",
            item.id,
            {
                "summary": summary,
                "original": item.content,
                "importance": item.importance,
                "timestamp": item.timestamp.isoformat()
            }
        )
        
        # 标记为已巩固
        item.level = MemoryLevel.LONG_TERM
    
    def _generate_summary(self, content: str, max_length: int = 100) -> str:
        """生成内容摘要"""
        # 简化版：取前max_length个字符
        # 实际应使用摘要模型
        if len(content) <= max_length:
            return content
        return content[:max_length] + "..."
    
    def _extract_entities(self, content: str) -> List[str]:
        """提取实体（简化版）"""
        # 实际应使用NER模型
        # 这里使用简单的关键词提取
        words = content.split()
        # 过滤短词和常见词
        stopwords = {"the", "a", "an", "is", "are", "was", "were"}
        entities = [w for w in words if len(w) > 3 and w.lower() not in stopwords]
        return list(set(entities))[:5]  # 最多返回5个
    
    def _extract_preference(self, item: MemoryItem):
        """提取用户偏好"""
        # 解析偏好设置
        content = item.content.lower()
        if "preference" in content or "prefer" in content:
            # 简单解析：查找 "key: value" 模式
            parts = content.split(":")
            if len(parts) >= 2:
                key = parts[0].strip()
                value = ":".join(parts[1:]).strip()
                self.ltm.update_user_profile(key, value)
    
    def run_full_consolidation(self) -> Dict:
        """运行完整巩固流程"""
        results = {
            "stm_to_mtm": self.consolidate_stm_to_mtm(),
            "mtm_to_ltm": self.consolidate_mtm_to_ltm()
        }
        return results


# ============================================================================
# 7. 记忆检索引擎
# ============================================================================

class MemoryRetrievalEngine:
    """
    记忆检索引擎
    支持多层级、多策略的记忆检索
    """
    
    def __init__(self,
                 stm: ShortTermMemory,
                 mtm: MediumTermMemory,
                 ltm: LongTermMemory,
                 encoder: Optional[VectorEncoder] = None):
        self.stm = stm
        self.mtm = mtm
        self.ltm = ltm
        self.encoder = encoder or VectorEncoder()
        self.forgetting_model = ForgettingCurveModel()
        
    def retrieve(self, query: str, 
                 context: Optional[Dict] = None,
                 top_k: int = 5,
                 time_range: Optional[Tuple[datetime, datetime]] = None) -> List[Dict]:
        """
        综合检索
        
        Args:
            query: 查询字符串
            context: 当前上下文
            top_k: 返回结果数量
            time_range: 时间范围过滤
            
        Returns:
            检索结果列表
        """
        all_results = []
        
        # 1. 短期记忆检索
        stm_results = self._search_stm(query)
        all_results.extend(stm_results)
        
        # 2. 中期记忆检索
        mtm_results = self._search_mtm(query, time_range)
        all_results.extend(mtm_results)
        
        # 3. 长期记忆检索
        ltm_results = self._search_ltm(query)
        all_results.extend(ltm_results)
        
        # 4. 重排序
        ranked_results = self._rerank_results(all_results, query, context)
        
        # 5. 更新访问统计
        for result in ranked_results[:top_k]:
            if "item" in result:
                item = result["item"]
                item.access_count += 1
                item.last_accessed = datetime.now()
        
        return ranked_results[:top_k]
    
    def _search_stm(self, query: str) -> List[Dict]:
        """搜索短期记忆"""
        query_vec = self.encoder.encode(query)
        results = []
        
        for item in self.stm.get_all():
            if item.vector is not None:
                sim = self.encoder.similarity(query_vec, item.vector)
                results.append({
                    "item": item,
                    "source": "stm",
                    "similarity": sim,
                    "score": sim * 1.2  # 短期记忆加权
                })
        
        return results
    
    def _search_mtm(self, query: str, 
                    time_range: Optional[Tuple[datetime, datetime]] = None) -> List[Dict]:
        """搜索中期记忆"""
        results = []
        
        # 语义搜索
        search_results = self.mtm.search(query, top_k=10)
        
        for item, sim in search_results:
            # 时间过滤
            if time_range and not (time_range[0] <= item.timestamp <= time_range[1]):
                continue
            
            # 计算可检索性
            retrievability = self.forgetting_model.calculate_retrievability(item)
            
            results.append({
                "item": item,
                "source": "mtm",
                "similarity": sim,
                "retrievability": retrievability,
                "score": sim * retrievability * (0.5 + 0.5 * item.importance)
            })
        
        return results
    
    def _search_ltm(self, query: str) -> List[Dict]:
        """搜索长期记忆"""
        results = []
        
        # 1. 事实检索
        for key, fact in self.ltm.facts.items():
            if query.lower() in key.lower() or query.lower() in fact["value"].lower():
                results.append({
                    "source": "ltm_facts",
                    "key": key,
                    "value": fact["value"],
                    "score": 0.9
                })
        
        # 2. 用户画像检索
        for key, pref in self.ltm.user_profile["preferences"].items():
            if query.lower() in key.lower():
                results.append({
                    "source": "ltm_profile",
                    "key": key,
                    "value": pref["value"],
                    "score": 0.85
                })
        
        return results
    
    def _rerank_results(self, results: List[Dict], query: str, 
                        context: Optional[Dict]) -> List[Dict]:
        """重排序结果"""
        # 按分数排序
        results.sort(key=lambda x: x.get("score", 0), reverse=True)
        
        # 去重
        seen_contents = set()
        unique_results = []
        for r in results:
            if "item" in r and r["item"] is not None:
                content = r["item"].content if hasattr(r["item"], "content") else str(r["item"])
            else:
                content = r.get("value", "")
            if content not in seen_contents:
                seen_contents.add(content)
                unique_results.append(r)
        
        return unique_results
    
    def retrieve_by_entity(self, entity: str) -> List[Dict]:
        """按实体检索"""
        results = []
        
        # 中期记忆
        for item in self.mtm.get_all():
            if entity.lower() in item.content.lower():
                results.append({
                    "item": item,
                    "source": "mtm",
                    "match_type": "entity"
                })
        
        # 长期记忆
        knowledge = self.ltm.query_knowledge("entities", entity)
        if knowledge:
            results.append({
                "source": "ltm",
                "knowledge": knowledge,
                "match_type": "entity"
            })
        
        return results


# ============================================================================
# 8. 记忆管理系统主类
# ============================================================================

class MemorySystem:
    """
    Agent记忆管理系统主类
    整合三层记忆、巩固和检索功能
    """
    
    def __init__(self, stm_capacity: int = 100):
        self.encoder = VectorEncoder()
        self.stm = ShortTermMemory(capacity=stm_capacity, encoder=self.encoder)
        self.mtm = MediumTermMemory(encoder=self.encoder)
        self.ltm = LongTermMemory()
        
        self.consolidation_engine = ConsolidationEngine(
            self.stm, self.mtm, self.ltm, self.encoder
        )
        self.retrieval_engine = MemoryRetrievalEngine(
            self.stm, self.mtm, self.ltm, self.encoder
        )
        self.rehearsal_scheduler = RehearsalScheduler()
        
        self.stats = {
            "total_stored": 0,
            "total_retrieved": 0,
            "consolidation_runs": 0
        }
    
    # ========== 存储接口 ==========
    
    def store(self, content: str, 
              memory_type: MemoryType = MemoryType.CONVERSATION,
              importance: float = 0.5,
              metadata: Optional[Dict] = None) -> str:
        """
        存储记忆
        
        Args:
            content: 记忆内容
            memory_type: 记忆类型
            importance: 重要性 (0-1)
            metadata: 元数据
            
        Returns:
            记忆ID
        """
        item, overflow = self.stm.add(content, memory_type, importance, metadata)
        
        # 处理溢出的记忆
        if overflow:
            self.mtm.add(overflow)
        
        self.stats["total_stored"] += 1
        return item.id
    
    def store_fact(self, key: str, value: str, confidence: float = 1.0):
        """存储事实到长期记忆"""
        self.ltm.store_fact(key, value, confidence)
    
    def store_preference(self, key: str, value: Any):
        """存储用户偏好"""
        self.ltm.update_user_profile(key, value)
    
    # ========== 检索接口 ==========
    
    def retrieve(self, query: str, top_k: int = 5, 
                 time_range: Optional[Tuple[datetime, datetime]] = None) -> List[Dict]:
        """
        检索记忆
        
        Args:
            query: 查询字符串
            top_k: 返回结果数量
            time_range: 时间范围过滤
            
        Returns:
            检索结果
        """
        results = self.retrieval_engine.retrieve(query, top_k=top_k, 
                                                  time_range=time_range)
        self.stats["total_retrieved"] += 1
        return results
    
    def get_recent(self, n: int = 10) -> List[MemoryItem]:
        """获取最近的记忆"""
        return self.stm.get_context(n)
    
    def get_user_profile(self, key: Optional[str] = None) -> Any:
        """获取用户画像"""
        return self.ltm.get_user_profile(key)
    
    # ========== 巩固接口 ==========
    
    def consolidate(self, force: bool = False) -> Dict:
        """
        触发记忆巩固
        
        Args:
            force: 是否强制巩固
            
        Returns:
            巩固结果统计
        """
        results = self.consolidation_engine.run_full_consolidation()
        self.stats["consolidation_runs"] += 1
        return results
    
    def schedule_rehearsal(self, memory_id: str) -> datetime:
        """安排记忆复习"""
        item = self.mtm.get_item(memory_id)
        if item:
            return self.rehearsal_scheduler.schedule_review(item)
        return datetime.now()
    
    # ========== 管理接口 ==========
    
    def forget(self, memory_id: str, level: str = "soft"):
        """
        遗忘记忆
        
        Args:
            memory_id: 记忆ID
            level: "soft"(降低权重) 或 "hard"(删除)
        """
        # 在各层查找并处理
        if level == "hard":
            if memory_id in self.mtm.items:
                del self.mtm.items[memory_id]
        else:
            item = self.mtm.get_item(memory_id)
            if item:
                item.importance *= 0.5
                item.stability *= 0.5
    
    def get_stats(self) -> Dict:
        """获取系统统计"""
        return {
            **self.stats,
            "stm_count": len(self.stm.items),
            "mtm_count": len(self.mtm.items),
            "ltm_facts": len(self.ltm.facts),
            "ltm_knowledge_entities": len(self.ltm.knowledge_graph["entities"])
        }
    
    def export(self) -> Dict:
        """导出所有记忆"""
        return {
            "stm": [item.to_dict() for item in self.stm.get_all()],
            "mtm": [item.to_dict() for item in self.mtm.get_all()],
            "ltm": self.ltm.export(),
            "stats": self.stats
        }
    
    def save_to_file(self, filepath: str):
        """保存到文件"""
        data = self.export()
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    @classmethod
    def load_from_file(cls, filepath: str) -> 'MemorySystem':
        """从文件加载"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        system = cls()
        
        # 恢复STM
        for item_data in data.get("stm", []):
            item = MemoryItem.from_dict(item_data)
            system.stm.items.append(item)
        
        # 恢复MTM
        for item_data in data.get("mtm", []):
            item = MemoryItem.from_dict(item_data)
            system.mtm.items[item.id] = item
        
        # 恢复统计
        system.stats = data.get("stats", system.stats)
        
        return system


# ============================================================================
# 9. 使用示例和测试
# ============================================================================

def demo():
    """演示使用"""
    print("=" * 60)
    print("Agent记忆系统演示")
    print("=" * 60)
    
    # 创建记忆系统
    memory = MemorySystem(stm_capacity=10)
    
    # 存储一些记忆
    print("\n1. 存储记忆...")
    
    # 用户偏好
    memory.store("用户喜欢深色主题", MemoryType.PREFERENCE, importance=0.9)
    memory.store("用户名叫张三", MemoryType.FACT, importance=0.95)
    memory.store("用户对AI编程感兴趣", MemoryType.PREFERENCE, importance=0.8)
    
    # 对话历史
    for i in range(15):
        memory.store(f"对话内容 {i+1}: 这是第{i+1}轮对话", 
                    MemoryType.CONVERSATION, 
                    importance=0.3 + 0.04 * i)
    
    print(f"   STM条目数: {len(memory.stm.items)}")
    print(f"   MTM条目数: {len(memory.mtm.items)}")
    
    # 检索测试
    print("\n2. 检索测试...")
    results = memory.retrieve("用户名字", top_k=3)
    for r in results:
        if "item" in r:
            print(f"   - {r['item'].content} (来源: {r['source']}, 分数: {r.get('score', 0):.3f})")
        else:
            print(f"   - {r.get('value', 'N/A')} (来源: {r['source']})")
    
    # 巩固测试
    print("\n3. 记忆巩固...")
    consolidation_results = memory.consolidate(force=True)
    print(f"   STM→MTM: {len(consolidation_results['stm_to_mtm'])} 条")
    print(f"   MTM→LTM处理: {consolidation_results['mtm_to_ltm']['processed']} 条")
    
    # 用户画像
    print("\n4. 用户画像...")
    profile = memory.get_user_profile()
    print(f"   偏好设置: {list(profile['preferences'].keys())}")
    
    # 统计
    print("\n5. 系统统计...")
    stats = memory.get_stats()
    for key, value in stats.items():
        print(f"   {key}: {value}")
    
    print("\n" + "=" * 60)
    print("演示完成")
    print("=" * 60)
    
    return memory


if __name__ == "__main__":
    demo()
