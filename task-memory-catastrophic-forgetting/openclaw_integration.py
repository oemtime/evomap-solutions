"""
OpenClaw记忆系统集成示例
Integration Example with OpenClaw Memory System

展示如何将三层记忆架构集成到OpenClaw的memory/目录结构中
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

# 导入核心算法
from core_algorithms import (
    MemorySystem, MemoryItem, MemoryType, MemoryLevel,
    ShortTermMemory, MediumTermMemory, LongTermMemory
)


class OpenClawMemoryAdapter:
    """
    OpenClaw记忆系统适配器
    将三层记忆架构与OpenClaw的memory/目录集成
    """
    
    def __init__(self, workspace_path: str = "."):
        self.workspace = Path(workspace_path)
        self.memory_dir = self.workspace / "memory"
        
        # 确保目录结构存在
        self._ensure_directory_structure()
        
        # 初始化记忆系统
        self.memory_system = MemorySystem(stm_capacity=50)
        
        # 加载已有记忆
        self._load_existing_memories()
    
    def _ensure_directory_structure(self):
        """确保目录结构存在"""
        dirs = [
            self.memory_dir,
            self.memory_dir / "stm",
            self.memory_dir / "mtm",
            self.memory_dir / "mtm" / "episodes",
            self.memory_dir / "mtm" / "vectors",
            self.memory_dir / "ltm",
            self.memory_dir / "ltm" / "knowledge_graph"
        ]
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)
    
    def _load_existing_memories(self):
        """加载已有的记忆文件"""
        # 加载MEMORY.md中的长期记忆
        memory_md = self.memory_dir / "MEMORY.md"
        if memory_md.exists():
            self._parse_memory_md(memory_md)
        
        # 加载今日记忆
        today = datetime.now().strftime("%Y-%m-%d")
        today_md = self.memory_dir / f"{today}.md"
        if today_md.exists():
            self._parse_daily_memory(today_md)
        
        # 加载STM快照
        stm_snapshot = self.memory_dir / "stm" / "snapshot.json"
        if stm_snapshot.exists():
            self._load_stm_snapshot(stm_snapshot)
    
    def _parse_memory_md(self, filepath: Path):
        """解析MEMORY.md文件"""
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 提取用户画像和关键事实
        # 简单解析：查找关键信息段落
        if "用户" in content or "User" in content:
            # 提取用户相关信息到长期记忆
            self.memory_system.ltm.update_user_profile("memory_md_summary", content[:500])
    
    def _parse_daily_memory(self, filepath: Path):
        """解析每日记忆文件"""
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 将每日记忆作为情节记忆存储
        date = filepath.stem
        self.memory_system.store(
            content=f"[{date}] 的记忆:\n{content[:1000]}",
            memory_type=MemoryType.EPISODE,
            importance=0.6,
            metadata={"date": date, "source": "daily_memory"}
        )
    
    def _load_stm_snapshot(self, filepath: Path):
        """加载STM快照"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for item_data in data.get("items", []):
                self.memory_system.store(
                    content=item_data["content"],
                    memory_type=MemoryType(item_data.get("type", "conversation")),
                    importance=item_data.get("importance", 0.5)
                )
        except Exception as e:
            print(f"加载STM快照失败: {e}")
    
    # ========== OpenClaw集成接口 ==========
    
    def store_interaction(self, user_input: str, agent_response: str, 
                         importance: float = 0.5):
        """
        存储交互记录
        
        Args:
            user_input: 用户输入
            agent_response: Agent回复
            importance: 重要性
        """
        # 存储用户输入
        self.memory_system.store(
            content=f"User: {user_input}",
            memory_type=MemoryType.CONVERSATION,
            importance=importance,
            metadata={"role": "user"}
        )
        
        # 存储Agent回复
        self.memory_system.store(
            content=f"Agent: {agent_response}",
            memory_type=MemoryType.CONVERSATION,
            importance=importance,
            metadata={"role": "assistant"}
        )
    
    def store_fact(self, key: str, value: str, confidence: float = 1.0):
        """
        存储事实
        
        同时更新到：
        1. 长期记忆系统
        2. MEMORY.md文件
        """
        # 存储到记忆系统
        self.memory_system.store_fact(key, value, confidence)
        
        # 更新MEMORY.md
        self._update_memory_md(key, value)
    
    def store_user_preference(self, key: str, value: Any):
        """
        存储用户偏好
        
        Args:
            key: 偏好键名
            value: 偏好值
        """
        self.memory_system.store_preference(key, value)
        
        # 同时写入用户画像文件
        self._update_user_profile(key, value)
    
    def get_context_for_llm(self, max_items: int = 10) -> str:
        """
        获取用于LLM上下文的记忆
        
        Returns:
            格式化的上下文字符串
        """
        context_parts = []
        
        # 1. 用户画像
        profile = self.memory_system.get_user_profile()
        if profile and profile.get("preferences"):
            prefs = []
            for k, v in profile["preferences"].items():
                if isinstance(v, dict) and "value" in v:
                    prefs.append(f"- {k}: {v['value']}")
                else:
                    prefs.append(f"- {k}: {v}")
            if prefs:
                context_parts.append("## 用户画像\n" + "\n".join(prefs))
        
        # 2. 相关事实
        facts = []
        for key, fact in self.memory_system.ltm.facts.items():
            facts.append(f"- {key}: {fact['value']}")
        if facts:
            context_parts.append("## 已知事实\n" + "\n".join(facts[:5]))
        
        # 3. 最近对话
        recent = self.memory_system.get_recent(max_items)
        if recent:
            context_parts.append("## 最近对话")
            for item in recent:
                context_parts.append(item.content)
        
        return "\n\n".join(context_parts)
    
    def retrieve_relevant(self, query: str, top_k: int = 5) -> List[Dict]:
        """
        检索相关记忆
        
        Args:
            query: 查询字符串
            top_k: 返回数量
            
        Returns:
            相关记忆列表
        """
        return self.memory_system.retrieve(query, top_k=top_k)
    
    def consolidate_memories(self):
        """
        执行记忆巩固
        
        将短期记忆转移到中期记忆，重要记忆转移到长期记忆
        """
        results = self.memory_system.consolidate()
        
        # 保存到文件
        self._save_memories()
        
        return results
    
    # ========== 文件操作 ==========
    
    def _update_memory_md(self, key: str, value: str):
        """更新MEMORY.md文件"""
        memory_md = self.memory_dir / "MEMORY.md"
        
        entry = f"\n- **{key}**: {value} (更新于 {datetime.now().strftime('%Y-%m-%d %H:%M')})"
        
        if memory_md.exists():
            with open(memory_md, 'a', encoding='utf-8') as f:
                f.write(entry)
        else:
            with open(memory_md, 'w', encoding='utf-8') as f:
                f.write("# 长期记忆\n\n")
                f.write(entry)
    
    def _update_user_profile(self, key: str, value: Any):
        """更新用户画像文件"""
        profile_file = self.memory_dir / "ltm" / "user_profile.json"
        
        profile = {}
        if profile_file.exists():
            with open(profile_file, 'r', encoding='utf-8') as f:
                profile = json.load(f)
        
        profile[key] = {
            "value": value,
            "updated_at": datetime.now().isoformat()
        }
        
        with open(profile_file, 'w', encoding='utf-8') as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
    
    def _save_memories(self):
        """保存记忆到文件"""
        # 保存STM快照
        stm_data = {
            "timestamp": datetime.now().isoformat(),
            "items": [
                {
                    "id": item.id,
                    "content": item.content,
                    "type": item.type.value,
                    "importance": item.importance,
                    "timestamp": item.timestamp.isoformat()
                }
                for item in self.memory_system.stm.get_all()
            ]
        }
        
        stm_file = self.memory_dir / "stm" / "snapshot.json"
        with open(stm_file, 'w', encoding='utf-8') as f:
            json.dump(stm_data, f, ensure_ascii=False, indent=2)
        
        # 保存MTM向量索引
        mtm_index = {
            "count": len(self.memory_system.mtm.items),
            "items": [
                {
                    "id": item.id,
                    "content": item.content[:100] + "..." if len(item.content) > 100 else item.content,
                    "type": item.type.value,
                    "importance": item.importance
                }
                for item in self.memory_system.mtm.get_all()
            ]
        }
        
        mtm_file = self.memory_dir / "mtm" / "index.json"
        with open(mtm_file, 'w', encoding='utf-8') as f:
            json.dump(mtm_index, f, ensure_ascii=False, indent=2)
        
        # 保存LTM
        ltm_file = self.memory_dir / "ltm" / "knowledge_base.json"
        with open(ltm_file, 'w', encoding='utf-8') as f:
            json.dump(self.memory_system.ltm.export(), f, ensure_ascii=False, indent=2)
    
    def save_daily_summary(self):
        """保存每日记忆摘要"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # 生成今日摘要
        summary = self._generate_daily_summary()
        
        # 写入文件
        daily_file = self.memory_dir / f"{today}.md"
        with open(daily_file, 'w', encoding='utf-8') as f:
            f.write(f"# {today} 记忆摘要\n\n")
            f.write(summary)
    
    def _generate_daily_summary(self) -> str:
        """生成每日摘要"""
        parts = []
        
        # 今日交互统计
        stats = self.memory_system.get_stats()
        parts.append(f"## 统计\n")
        parts.append(f"- 今日存储: {stats['total_stored']} 条")
        parts.append(f"- STM: {stats['stm_count']} 条")
        parts.append(f"- MTM: {stats['mtm_count']} 条")
        
        # 重要记忆
        parts.append(f"\n## 重要记忆\n")
        for item in self.memory_system.mtm.get_all():
            if item.importance > 0.8:
                parts.append(f"- {item.content[:100]}")
        
        return "\n".join(parts)


# ============================================================================
# OpenClaw Agent集成示例
# ============================================================================

class OpenClawAgentWithMemory:
    """
    集成记忆系统的OpenClaw Agent示例
    
    展示如何在实际Agent中使用记忆系统
    """
    
    def __init__(self, workspace_path: str = "."):
        self.memory = OpenClawMemoryAdapter(workspace_path)
        self.session_start = datetime.now()
    
    def process_message(self, user_message: str) -> str:
        """
        处理用户消息
        
        流程：
        1. 检索相关记忆
        2. 构建上下文
        3. 生成回复
        4. 存储交互
        """
        # 1. 检索相关记忆
        relevant_memories = self.memory.retrieve_relevant(user_message, top_k=3)
        
        # 2. 获取上下文
        context = self.memory.get_context_for_llm(max_items=5)
        
        # 3. 构建prompt (简化示例)
        prompt = self._build_prompt(user_message, context, relevant_memories)
        
        # 4. 生成回复 (这里模拟)
        response = self._generate_response(prompt)
        
        # 5. 存储交互
        importance = self._assess_importance(user_message, response)
        self.memory.store_interaction(user_message, response, importance)
        
        # 6. 检查是否需要巩固
        if self._should_consolidate():
            self.memory.consolidate_memories()
        
        return response
    
    def _build_prompt(self, user_message: str, context: str, 
                      relevant_memories: List[Dict]) -> str:
        """构建LLM prompt"""
        prompt_parts = []
        
        # 系统提示
        prompt_parts.append("你是一个有长期记忆的AI助手。请参考以下记忆来回答用户问题。\n")
        
        # 上下文
        if context:
            prompt_parts.append("=== 记忆上下文 ===")
            prompt_parts.append(context)
            prompt_parts.append("")
        
        # 相关记忆
        if relevant_memories:
            prompt_parts.append("=== 相关记忆 ===")
            for mem in relevant_memories:
                if "item" in mem:
                    prompt_parts.append(f"- {mem['item'].content}")
            prompt_parts.append("")
        
        # 用户消息
        prompt_parts.append(f"=== 用户消息 ===")
        prompt_parts.append(user_message)
        
        return "\n".join(prompt_parts)
    
    def _generate_response(self, prompt: str) -> str:
        """
        生成回复
        
        实际实现应调用LLM API
        这里返回模拟回复
        """
        # 模拟回复生成
        return f"[基于记忆系统的回复] 我收到了你的消息。"
    
    def _assess_importance(self, user_message: str, response: str) -> float:
        """评估交互重要性"""
        importance = 0.5
        
        # 包含关键信息的交互更重要
        key_indicators = [
            "名字", "名称", "喜欢", "讨厌", "偏好",
            "name", "like", "prefer", "hate"
        ]
        
        for indicator in key_indicators:
            if indicator in user_message.lower():
                importance = 0.9
                break
        
        return importance
    
    def _should_consolidate(self) -> bool:
        """检查是否应该执行记忆巩固"""
        # 每10次交互巩固一次
        stats = self.memory.memory_system.get_stats()
        return stats["total_stored"] % 10 == 0
    
    def remember_fact(self, key: str, value: str):
        """记住事实"""
        self.memory.store_fact(key, value)
    
    def recall_fact(self, key: str) -> Optional[str]:
        """回忆事实"""
        return self.memory.memory_system.ltm.get_fact(key)
    
    def end_session(self):
        """结束会话，保存记忆"""
        # 执行最终巩固
        self.memory.consolidate_memories()
        
        # 保存每日摘要
        self.memory.save_daily_summary()


# ============================================================================
# 使用示例
# ============================================================================

def integration_demo():
    """集成演示"""
    print("=" * 60)
    print("OpenClaw记忆系统集成演示")
    print("=" * 60)
    
    # 创建Agent
    agent = OpenClawAgentWithMemory(workspace_path=".")
    
    # 模拟对话
    print("\n1. 模拟对话...")
    
    conversations = [
        ("你好，我叫张三", "问候+名字"),
        ("我喜欢深色主题", "偏好设置"),
        ("请帮我写一段Python代码", "任务请求"),
        ("我住在杭州", "位置信息"),
        ("记得我喜欢什么主题吗？", "记忆检索测试"),
    ]
    
    for user_msg, description in conversations:
        print(f"\n   [{description}]")
        print(f"   User: {user_msg}")
        response = agent.process_message(user_msg)
        print(f"   Agent: {response}")
    
    # 事实记忆
    print("\n2. 事实记忆...")
    agent.remember_fact("用户职业", "AI创业者")
    agent.remember_fact("用户技能", "Python, AI")
    
    fact = agent.recall_fact("用户职业")
    print(f"   回忆: 用户职业 = {fact}")
    
    # 结束会话
    print("\n3. 保存记忆...")
    agent.end_session()
    
    # 显示统计
    print("\n4. 系统统计...")
    stats = agent.memory.memory_system.get_stats()
    for key, value in stats.items():
        print(f"   {key}: {value}")
    
    print("\n" + "=" * 60)
    print("集成演示完成")
    print("=" * 60)


if __name__ == "__main__":
    integration_demo()
