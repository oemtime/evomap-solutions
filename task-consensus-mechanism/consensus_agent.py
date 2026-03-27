"""
Multi-Agent Consensus Mechanism - Hybrid Raft + BFT Implementation
EvoMap Bounty Task Solution

Author: Silicon Squad (xiaoe-bot, beta-bot, gamma-bot)
Date: 2026-03-27
"""

from enum import Enum
from typing import List, Dict, Optional, Any
import asyncio
import random
import time
import hashlib
import json
from dataclasses import dataclass, field


class Role(Enum):
    FOLLOWER = "follower"
    CANDIDATE = "candidate"
    LEADER = "leader"


class DecisionType(Enum):
    NORMAL = "normal"
    CRITICAL = "critical"


class MessageType(Enum):
    REQUEST_VOTE = "request_vote"
    REQUEST_VOTE_RESPONSE = "request_vote_response"
    APPEND_ENTRIES = "append_entries"
    PRE_PREPARE = "pre_prepare"
    PREPARE = "prepare"
    COMMIT = "commit"


@dataclass
class LogEntry:
    term: int
    index: int
    decision: Any
    decision_type: DecisionType
    timestamp: float
    bft_signature: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "term": self.term,
            "index": self.index,
            "decision": self.decision,
            "decision_type": self.decision_type.value,
            "timestamp": self.timestamp,
            "bft_signature": self.bft_signature
        }


@dataclass
class ConsensusAgent:
    """Agent participating in consensus"""
    agent_id: str
    peers: List[str]
    
    role: Role = Role.FOLLOWER
    current_term: int = 0
    voted_for: Optional[str] = None
    log: List[LogEntry] = field(default_factory=list)
    commit_index: int = -1
    last_applied: int = -1
    
    next_index: Dict[str, int] = field(default_factory=dict)
    match_index: Dict[str, int] = field(default_factory=dict)
    
    prepared: set = field(default_factory=set)
    committed: set = field(default_factory=set)
    
    election_timeout: float = field(default_factory=lambda: random.uniform(1.5, 3.0))
    heartbeat_interval: float = 0.5
    last_heartbeat: float = field(default_factory=time.time)
    
    state_machine: Dict[int, Any] = field(default_factory=dict)

    async def run(self):
        """Main event loop"""
        while True:
            if self.role == Role.FOLLOWER:
                await self._run_follower()
            elif self.role == Role.CANDIDATE:
                await self._run_candidate()
            elif self.role == Role.LEADER:
                await self._run_leader()

    async def _run_follower(self):
        while self.role == Role.FOLLOWER:
            await asyncio.sleep(0.1)
            if time.time() - self.last_heartbeat > self.election_timeout:
                self._become_candidate()

    async def _run_candidate(self):
        self.current_term += 1
        self.voted_for = self.agent_id
        votes = 1
        
        vote_tasks = [self._request_vote(peer) for peer in self.peers]
        results = await asyncio.gather(*vote_tasks, return_exceptions=True)
        
        for result in results:
            if result is True:
                votes += 1
        
        if votes > (len(self.peers) + 1) // 2:
            self._become_leader()
        else:
            self.election_timeout = random.uniform(1.5, 3.0)
            self.last_heartbeat = time.time()

    async def _run_leader(self):
        for peer in self.peers:
            self.next_index[peer] = len(self.log)
            self.match_index[peer] = -1
        
        while self.role == Role.LEADER:
            await self._send_heartbeats()
            await asyncio.sleep(self.heartbeat_interval)

    async def propose(self, decision: Any, decision_type: DecisionType = DecisionType.NORMAL) -> Dict:
        if self.role != Role.LEADER:
            return await self._forward_to_leader(decision, decision_type)
        
        entry = LogEntry(
            term=self.current_term,
            index=len(self.log),
            decision=decision,
            decision_type=decision_type,
            timestamp=time.time()
        )
        
        if decision_type == DecisionType.CRITICAL:
            entry.bft_signature = self._create_bft_signature(entry)
        
        self.log.append(entry)
        
        if decision_type == DecisionType.CRITICAL:
            success = await self._pbft_consensus(entry)
        else:
            success = await self._raft_replication(entry)
        
        if success:
            self.commit_index = entry.index
            await self._apply_committed()
            return {"status": "committed", "index": entry.index, "term": entry.term}
        else:
            return {"status": "rejected", "reason": "no_consensus"}

    async def _raft_replication(self, entry: LogEntry) -> bool:
        success_count = 1
        replication_tasks = [self._replicate_to_peer(peer, entry) for peer in self.peers]
        results = await asyncio.gather(*replication_tasks, return_exceptions=True)
        
        for result in results:
            if result is True:
                success_count += 1
        
        return success_count > (len(self.peers) + 1) // 2

    async def _pbft_consensus(self, entry: LogEntry) -> bool:
        n = len(self.peers) + 1
        f = (n - 1) // 3
        
        prepare_count = 1
        prepare_tasks = [self._send_prepare(peer, {"digest": self._hash_entry(entry)}) for peer in self.peers]
        results = await asyncio.gather(*prepare_tasks, return_exceptions=True)
        
        for result in results:
            if result is True:
                prepare_count += 1
        
        if prepare_count < 2 * f + 1:
            return False
        
        commit_count = 1
        commit_tasks = [self._send_commit(peer, entry.index) for peer in self.peers]
        results = await asyncio.gather(*commit_tasks, return_exceptions=True)
        
        for result in results:
            if result is True:
                commit_count += 1
        
        return commit_count >= 2 * f + 1

    def _create_bft_signature(self, entry: LogEntry) -> str:
        content = json.dumps({
            "agent_id": self.agent_id,
            "term": entry.term,
            "index": entry.index,
            "decision": entry.decision,
            "timestamp": entry.timestamp
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def _hash_entry(self, entry: LogEntry) -> str:
        return hashlib.sha256(
            json.dumps(entry.to_dict(), sort_keys=True).encode()
        ).hexdigest()[:16]

    async def _send_heartbeats(self):
        heartbeat_tasks = [self._send_append_entries(peer, heartbeat=True) for peer in self.peers]
        await asyncio.gather(*heartbeat_tasks, return_exceptions=True)

    def _become_candidate(self):
        self.role = Role.CANDIDATE
        print(f"[{self.agent_id}] Becoming candidate for term {self.current_term + 1}")

    def _become_leader(self):
        self.role = Role.LEADER
        print(f"[{self.agent_id}] Becoming leader for term {self.current_term}")

    async def _apply_committed(self):
        while self.last_applied < self.commit_index:
            self.last_applied += 1
            if self.last_applied < len(self.log):
                entry = self.log[self.last_applied]
                self.state_machine[self.last_applied] = entry.decision
                print(f"[{self.agent_id}] Applied #{self.last_applied}: {entry.decision}")

    # RPC stubs
    async def _request_vote(self, peer: str) -> bool:
        await asyncio.sleep(0.01)
        return random.random() > 0.2

    async def _replicate_to_peer(self, peer: str, entry: LogEntry) -> bool:
        await asyncio.sleep(0.01)
        return random.random() > 0.15

    async def _send_append_entries(self, peer: str, heartbeat: bool = False):
        await asyncio.sleep(0.01)

    async def _send_prepare(self, peer: str, msg: Dict) -> bool:
        await asyncio.sleep(0.01)
        return random.random() > 0.2

    async def _send_commit(self, peer: str, index: int) -> bool:
        await asyncio.sleep(0.01)
        return random.random() > 0.2

    async def _forward_to_leader(self, decision: Any, decision_type: DecisionType) -> Dict:
        leader = await self._find_leader()
        if leader:
            return {"status": "forwarded", "to": leader}
        return {"status": "error", "reason": "no_leader"}

    async def _find_leader(self) -> Optional[str]:
        for peer in self.peers:
            if await self._query_is_leader(peer):
                return peer
        return None

    async def _query_is_leader(self, peer: str) -> bool:
        await asyncio.sleep(0.01)
        return random.random() > 0.7


class ConsensusNetwork:
    def __init__(self, num_agents: int = 5):
        self.agents: List[ConsensusAgent] = []
        self.agent_ids = [f"agent_{i}" for i in range(num_agents)]
        
        for i, agent_id in enumerate(self.agent_ids):
            peers = [aid for aid in self.agent_ids if aid != agent_id]
            agent = ConsensusAgent(agent_id=agent_id, peers=peers)
            self.agents.append(agent)

    async def start(self):
        tasks = [agent.run() for agent in self.agents]
        await asyncio.gather(*tasks)

    async def propose(self, agent_id: str, decision: Any, 
                      decision_type: DecisionType = DecisionType.NORMAL) -> Dict:
        agent = next((a for a in self.agents if a.agent_id == agent_id), None)
        if agent:
            return await agent.propose(decision, decision_type)
        return {"status": "error", "reason": "agent_not_found"}

    def get_leader(self) -> Optional[str]:
        for agent in self.agents:
            if agent.role == Role.LEADER:
                return agent.agent_id
        return None


async def demo():
    """Demonstration of consensus mechanism"""
    print("=" * 70)
    print("Multi-Agent Consensus Mechanism - Hybrid Raft + BFT Demo")
    print("=" * 70)
    
    network = ConsensusNetwork(num_agents=5)
    asyncio.create_task(network.start())
    
    print("\n[1] Waiting for leader election...")
    await asyncio.sleep(2)
    leader = network.get_leader()
    print(f"    Leader elected: {leader}")
    
    print("\n[2] Proposing NORMAL decision (Raft consensus):")
    result = await network.propose(
        leader or "agent_0",
        {"action": "update_config", "value": "threshold=0.7"},
        DecisionType.NORMAL
    )
    print(f"    Result: {result}")
    
    print("\n[3] Proposing CRITICAL decision (PBFT consensus):")
    result = await network.propose(
        leader or "agent_0",
        {"action": "transfer", "amount": 10000, "to": "agent_3"},
        DecisionType.CRITICAL
    )
    print(f"    Result: {result}")
    
    print("\n[4] Final Agent States:")
    for agent in network.agents:
        log_size = len(agent.log)
        committed = agent.commit_index + 1
        print(f"    {agent.agent_id}: role={agent.role.value:10} log={log_size:2} committed={committed:2}")
    
    print("\n" + "=" * 70)
    print("Demo Complete!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(demo())
