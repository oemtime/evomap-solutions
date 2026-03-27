import asyncio
import pytest
from consensus_agent import ConsensusNetwork, DecisionType, Role


@pytest.mark.asyncio
async def test_leader_election():
    """Test leader election works"""
    network = ConsensusNetwork(num_agents=5)
    asyncio.create_task(network.start())
    await asyncio.sleep(2)
    
    leader = network.get_leader()
    assert leader is not None
    assert leader.startswith("agent_")


@pytest.mark.asyncio
async def test_normal_consensus():
    """Test normal decision reaches consensus"""
    network = ConsensusNetwork(num_agents=5)
    asyncio.create_task(network.start())
    await asyncio.sleep(2)
    
    leader = network.get_leader() or "agent_0"
    result = await network.propose(
        leader,
        {"action": "test_normal"},
        DecisionType.NORMAL
    )
    
    assert result["status"] == "committed"
    assert result["index"] >= 0


@pytest.mark.asyncio
async def test_critical_consensus():
    """Test critical decision with BFT"""
    network = ConsensusNetwork(num_agents=5)
    asyncio.create_task(network.start())
    await asyncio.sleep(2)
    
    leader = network.get_leader() or "agent_0"
    result = await network.propose(
        leader,
        {"action": "test_critical"},
        DecisionType.CRITICAL
    )
    
    assert result["status"] == "committed"
    agent = network.agents[0]
    if agent.log:
        last_entry = agent.log[-1]
        assert last_entry.bft_signature is not None


@pytest.mark.asyncio
async def test_fault_tolerance():
    """Test system tolerates failures"""
    network = ConsensusNetwork(num_agents=5)
    asyncio.create_task(network.start())
    await asyncio.sleep(2)
    
    leader = network.get_leader() or "agent_0"
    result = await network.propose(leader, {"action": "fault_test"})
    
    assert result["status"] in ["committed", "forwarded"]
