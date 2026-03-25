"""
外部知识库整合 - Agent 协作示例
演示如何在多 Agent 场景中使用知识库整合
"""

import asyncio
from typing import List, Dict, Any
from datetime import datetime

from knowledge_integration import (
    KnowledgeCoordinator,
    RAGEngine,
    OpenClawMemoryIntegration,
    ConflictResolver,
    ResolutionStrategy,
    AgentInfo,
    DecisionContext,
    KnowledgeChunk,
    MemoryType,
    ShareType
)


class CollaborativeAgent:
    """协作 Agent 示例"""
    
    def __init__(
        self,
        agent_id: str,
        name: str,
        capabilities: List[str],
        knowledge_domains: List[str],
        coordinator: KnowledgeCoordinator
    ):
        self.id = agent_id
        self.name = name
        self.capabilities = capabilities
        self.knowledge_domains = knowledge_domains
        self.coordinator = coordinator
        self.local_knowledge: List[KnowledgeChunk] = []
        self.decision_history: List[Dict[str, Any]] = []
        
        # 注册到协调器
        self._register()
    
    def _register(self):
        """注册到知识协调器"""
        agent_info = AgentInfo(
            id=self.id,
            name=self.name,
            capabilities=self.capabilities,
            knowledge_domains=self.knowledge_domains
        )
        asyncio.create_task(
            self.coordinator.register_agent(agent_info)
        )
    
    async def make_decision(
        self,
        task: str,
        context_info: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        做出决策 - 使用外部知识库增强
        
        Args:
            task: 任务描述
            context_info: 额外上下文信息
        
        Returns:
            决策结果，包含检索到的知识和决策建议
        """
        print(f"\n[{self.name}] 正在处理任务: {task}")
        
        # 1. 构建决策上下文
        context = DecisionContext(
            agent_id=self.id,
            task_id=f"task_{datetime.now().timestamp()}",
            decision_type="collaborative",
            constraints=context_info or {},
            top_k=3
        )
        
        # 2. 检索相关知识
        retrieval_result = await self.coordinator.retrieve_for_decision(
            query=task,
            agent_id=self.id,
            context=context
        )
        
        print(f"  - 检索到 {len(retrieval_result.chunks)} 条相关知识")
        print(f"  - 检索延迟: {retrieval_result.latency_ms:.2f}ms")
        
        # 3. 基于检索结果做出决策
        decision = self._process_with_knowledge(task, retrieval_result)
        
        # 4. 记录决策历史
        self.decision_history.append({
            "task": task,
            "retrieved_knowledge": [c.id for c in retrieval_result.chunks],
            "decision": decision,
            "timestamp": datetime.now().isoformat()
        })
        
        return decision
    
    def _process_with_knowledge(
        self,
        task: str,
        retrieval_result: Any
    ) -> Dict[str, Any]:
        """
        基于检索到的知识处理任务
        
        这是一个简化实现，实际应该使用 LLM 进行推理
        """
        # 构建决策依据
        knowledge_summary = []
        for chunk in retrieval_result.chunks:
            knowledge_summary.append({
                "source": chunk.source,
                "relevance": f"{chunk.relevance_score:.2%}",
                "content_preview": chunk.content[:100] + "..."
            })
        
        # 模拟决策生成
        decision = {
            "agent": self.name,
            "task": task,
            "confidence": 0.85,
            "recommendation": f"基于检索到的 {len(retrieval_result.chunks)} 条知识，建议执行相关操作",
            "knowledge_used": knowledge_summary,
            "sources_traced": retrieval_result.sources_traced,
            "context": retrieval_result.context[:200] + "..." if retrieval_result.context else ""
        }
        
        return decision
    
    async def share_expertise(self, knowledge_content: str, source: str = "expertise"):
        """
        分享专业知识到共享知识库
        
        Args:
            knowledge_content: 知识内容
            source: 知识来源标识
        """
        print(f"\n[{self.name}] 分享专业知识...")
        
        # 创建知识块
        chunk = KnowledgeChunk(
            content=knowledge_content,
            source=source,
            tags=self.knowledge_domains + self.capabilities,
            metadata={
                "shared_by": self.id,
                "agent_name": self.name
            }
        )
        
        # 共享到协调器
        await self.coordinator.share_knowledge(
            sender_id=self.id,
            knowledge=[chunk],
            share_type=ShareType.BROADCAST
        )
        
        print(f"  - 已分享知识: {chunk.id}")
        
        return chunk.id
    
    async def request_help(
        self,
        query: str,
        target_domains: List[str] = None
    ) -> List[KnowledgeChunk]:
        """
        向其他 Agent 请求帮助
        
        Args:
            query: 查询内容
            target_domains: 目标知识领域
        
        Returns:
            其他 Agent 提供的知识
        """
        print(f"\n[{self.name}] 请求帮助: {query}")
        
        # 发现相关领域的 Agent
        target_agents = None
        if target_domains:
            agents = self.coordinator.agent_registry.discover(
                domains=target_domains
            )
            target_agents = [a.id for a in agents if a.id != self.id]
            print(f"  - 发现 {len(target_agents)} 个相关 Agent")
        
        # 发送知识请求
        knowledge = await self.coordinator.request_knowledge(
            requester_id=self.id,
            query=query,
            target_agents=target_agents
        )
        
        return knowledge


class CustomerServiceScenario:
    """客户服务场景示例"""
    
    def __init__(self):
        self.coordinator = KnowledgeCoordinator()
        self.agents: List[CollaborativeAgent] = []
    
    async def setup(self):
        """设置场景"""
        print("=" * 60)
        print("初始化客户服务多 Agent 协作场景")
        print("=" * 60)
        
        # 启动协调器
        await self.coordinator.start()
        
        # 创建不同角色的 Agent
        
        # 1. 技术支持 Agent
        tech_agent = CollaborativeAgent(
            agent_id="agent_tech_001",
            name="技术支持专家",
            capabilities=["故障诊断", "技术文档", "解决方案"],
            knowledge_domains=["技术", "产品", "故障排除"],
            coordinator=self.coordinator
        )
        self.agents.append(tech_agent)
        
        # 2. 产品专家 Agent
        product_agent = CollaborativeAgent(
            agent_id="agent_product_001",
            name="产品专家",
            capabilities=["产品咨询", "功能介绍", "使用指导"],
            knowledge_domains=["产品", "功能", "使用场景"],
            coordinator=self.coordinator
        )
        self.agents.append(product_agent)
        
        # 3. 客户关系 Agent
        crm_agent = CollaborativeAgent(
            agent_id="agent_crm_001",
            name="客户关系专员",
            capabilities=["客户沟通", "满意度管理", "投诉处理"],
            knowledge_domains=["客户", "沟通", "服务"],
            coordinator=self.coordinator
        )
        self.agents.append(crm_agent)
        
        print(f"\n已创建 {len(self.agents)} 个协作 Agent:")
        for agent in self.agents:
            print(f"  - {agent.name} ({agent.id})")
            print(f"    能力: {', '.join(agent.capabilities)}")
            print(f"    领域: {', '.join(agent.knowledge_domains)}")
    
    async def seed_knowledge_base(self):
        """初始化知识库"""
        print("\n" + "=" * 60)
        print("初始化共享知识库")
        print("=" * 60)
        
        # 技术支持 Agent 分享技术知识
        await self.agents[0].share_expertise(
            knowledge_content="""
            常见登录问题解决方案：
            1. 检查网络连接是否正常
            2. 确认用户名和密码输入正确（注意大小写）
            3. 清除浏览器缓存和 Cookie
            4. 尝试使用无痕模式登录
            5. 如果多次失败，账户可能被锁定，需要联系管理员解锁
            """,
            source="tech_support_kb"
        )
        
        await self.agents[0].share_expertise(
            knowledge_content="""
            系统性能优化建议：
            1. 定期清理临时文件和日志
            2. 关闭不必要的后台程序
            3. 更新到最新版本以获得性能改进
            4. 检查磁盘空间，确保至少有 20% 的可用空间
            5. 考虑升级硬件配置（内存、SSD）
            """,
            source="tech_support_kb"
        )
        
        # 产品专家 Agent 分享产品知识
        await self.agents[1].share_expertise(
            knowledge_content="""
            高级功能使用指南：
            1. 自动化工作流：设置触发条件和执行动作，实现业务流程自动化
            2. 数据分析仪表板：自定义图表和指标，实时监控业务数据
            3. API 集成：通过 REST API 与其他系统对接
            4. 团队协作：设置权限和角色，实现高效协作
            5. 自定义字段：根据业务需求添加自定义数据字段
            """,
            source="product_kb"
        )
        
        # 客户关系 Agent 分享服务知识
        await self.agents[2].share_expertise(
            knowledge_content="""
            客户沟通最佳实践：
            1. 主动倾听：让客户充分表达问题和需求
            2. 确认理解：复述客户问题以确保理解正确
            3. 提供选择：给出多个解决方案供客户选择
            4. 设定预期：明确告知解决时间和流程
            5. 跟进反馈：问题解决后主动询问满意度
            """,
            source="crm_kb"
        )
        
        # 索引到 RAG 引擎
        print("\n正在索引知识到向量数据库...")
        documents = [
            "常见登录问题解决方案：1. 检查网络连接 2. 确认用户名密码 3. 清除缓存",
            "系统性能优化：1. 清理临时文件 2. 关闭后台程序 3. 更新版本",
            "高级功能：自动化工作流、数据分析、API集成、团队协作",
            "客户沟通：主动倾听、确认理解、提供选择、设定预期、跟进反馈"
        ]
        
        chunk_ids = await self.coordinator.rag_engine.index_documents(
            documents=documents,
            source="shared_knowledge_base"
        )
        print(f"  - 已索引 {len(chunk_ids)} 个知识块")
    
    async def run_scenario(self):
        """运行场景"""
        print("\n" + "=" * 60)
        print("开始协作决策场景")
        print("=" * 60)
        
        # 场景 1: 客户报告登录问题
        print("\n【场景 1】客户报告无法登录系统")
        decision1 = await self.agents[2].make_decision(
            task="客户报告无法登录系统，显示密码错误",
            context_info={"priority": "high", "customer_tier": "premium"}
        )
        self._print_decision(decision1)
        
        # 场景 2: 客户询问高级功能
        print("\n【场景 2】客户询问如何使用自动化工作流")
        decision2 = await self.agents[2].make_decision(
            task="客户想了解如何设置自动化工作流来处理订单",
            context_info={"customer_type": "new_user"}
        )
        self._print_decision(decision2)
        
        # 场景 3: 技术支持 Agent 处理性能问题
        print("\n【场景 3】技术支持处理系统性能投诉")
        decision3 = await self.agents[0].make_decision(
            task="客户投诉系统运行缓慢，影响工作效率",
            context_info={"urgency": "medium"}
        )
        self._print_decision(decision3)
        
        # 场景 4: Agent 间知识请求
        print("\n【场景 4】客户关系 Agent 请求产品知识")
        await self.agents[2].request_help(
            query="API 集成相关文档",
            target_domains=["产品", "技术"]
        )
    
    def _print_decision(self, decision: Dict[str, Any]):
        """打印决策结果"""
        print(f"\n  决策结果:")
        print(f"    Agent: {decision['agent']}")
        print(f"    置信度: {decision['confidence']:.0%}")
        print(f"    建议: {decision['recommendation']}")
        print(f"    使用知识:")
        for i, knowledge in enumerate(decision['knowledge_used'], 1):
            print(f"      {i}. [{knowledge['source']}] 相关度: {knowledge['relevance']}")
            print(f"         {knowledge['content_preview']}")


class OpenClawIntegrationExample:
    """OpenClaw 记忆系统集成示例"""
    
    def __init__(self):
        self.integration = OpenClawMemoryIntegration()
        self.conflict_resolver = ConflictResolver(
            strategy=ResolutionStrategy.TIMESTAMP
        )
    
    async def demonstrate_sync(self):
        """演示双向同步"""
        print("\n" + "=" * 60)
        print("OpenClaw 记忆系统集成演示")
        print("=" * 60)
        
        # 1. 从 OpenClaw 记忆获取知识
        print("\n1. 从 OpenClaw 记忆系统检索知识...")
        knowledge = await self.integration.memory_to_knowledge(
            query="客户偏好",
            limit=5
        )
        print(f"   检索到 {len(knowledge)} 条记忆知识")
        for chunk in knowledge:
            print(f"   - {chunk.source}: {chunk.content[:50]}...")
        
        # 2. 将外部知识同步到 OpenClaw 记忆
        print("\n2. 将外部知识同步到 OpenClaw 记忆...")
        external_knowledge = [
            KnowledgeChunk(
                content="客户偏好使用移动端应用进行日常操作",
                source="analytics_system",
                confidence=0.92,
                relevance_score=0.88,
                tags=["客户行为", "移动端", "偏好"]
            ),
            KnowledgeChunk(
                content="客户对响应速度有较高期望，平均等待时间不应超过 30 秒",
                source="support_system",
                confidence=0.85,
                relevance_score=0.90,
                tags=["客户期望", "响应时间", "服务质量"]
            )
        ]
        
        memory_ids = await self.integration.knowledge_to_memory(
            knowledge=external_knowledge,
            memory_type=MemoryType.SEMANTIC
        )
        print(f"   已同步 {len(memory_ids)} 条知识到记忆系统")
        
        # 3. 冲突解决演示
        print("\n3. 知识冲突解决演示...")
        memory_knowledge = KnowledgeChunk(
            content="客户主要使用桌面端应用",
            source="openclaw_memory",
            confidence=0.75,
            timestamp=datetime(2024, 1, 1)
        )
        
        external_knowledge = KnowledgeChunk(
            content="客户主要使用移动端应用",
            source="analytics_system",
            confidence=0.92,
            timestamp=datetime(2024, 6, 1)
        )
        
        resolved = self.conflict_resolver.resolve(
            memory_knowledge,
            external_knowledge
        )
        
        print(f"   记忆知识: {memory_knowledge.content}")
        print(f"            置信度: {memory_knowledge.confidence}, 时间: {memory_knowledge.timestamp}")
        print(f"   外部知识: {external_knowledge.content}")
        print(f"            置信度: {external_knowledge.confidence}, 时间: {external_knowledge.timestamp}")
        print(f"   解决结果: {resolved.content}")
        print(f"            来源: {resolved.source}")


async def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("外部知识库整合 - 多 Agent 协作示例")
    print("=" * 60)
    
    # 示例 1: 客户服务场景
    scenario = CustomerServiceScenario()
    await scenario.setup()
    await scenario.seed_knowledge_base()
    await scenario.run_scenario()
    
    # 示例 2: OpenClaw 集成
    integration_example = OpenClawIntegrationExample()
    await integration_example.demonstrate_sync()
    
    print("\n" + "=" * 60)
    print("示例运行完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
