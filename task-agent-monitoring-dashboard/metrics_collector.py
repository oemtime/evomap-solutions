#!/usr/bin/env python3
"""
Agent监控数据收集器
用于收集和存储Agent的各项监控指标
"""

import json
import time
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from collections import deque
import sqlite3
import threading
from contextlib import contextmanager

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class RequestMetrics:
    """请求级别的指标"""
    request_id: str
    timestamp: datetime
    response_time_ms: float
    success: bool
    error_type: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    model: str = ""
    endpoint: str = ""
    user_id: Optional[str] = None
    session_id: Optional[str] = None


@dataclass
class SystemMetrics:
    """系统级别的指标"""
    timestamp: datetime
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    network_io_bytes: int
    concurrent_requests: int
    queue_depth: int
    active_sessions: int


@dataclass
class AlertRule:
    """告警规则"""
    name: str
    metric: str
    operator: str  # '>', '<', '>=', '<=', '=='
    threshold: float
    duration_seconds: int
    level: str  # 'P0', 'P1', 'P2', 'P3'
    message_template: str
    enabled: bool = True


class MetricsStore:
    """指标存储类"""
    
    def __init__(self, db_path: str = "metrics.db"):
        self.db_path = db_path
        self._local = threading.local()
        self._init_db()
    
    def _get_conn(self) -> sqlite3.Connection:
        """获取线程本地连接"""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(self.db_path)
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn
    
    def _init_db(self):
        """初始化数据库表"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 请求指标表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS request_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT UNIQUE,
                timestamp TEXT,
                response_time_ms REAL,
                success INTEGER,
                error_type TEXT,
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_tokens INTEGER,
                cost_usd REAL,
                model TEXT,
                endpoint TEXT,
                user_id TEXT,
                session_id TEXT
            )
        ''')
        
        # 系统指标表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                cpu_percent REAL,
                memory_percent REAL,
                disk_percent REAL,
                network_io_bytes INTEGER,
                concurrent_requests INTEGER,
                queue_depth INTEGER,
                active_sessions INTEGER
            )
        ''')
        
        # 告警记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                rule_name TEXT,
                level TEXT,
                metric TEXT,
                current_value REAL,
                threshold REAL,
                message TEXT,
                acknowledged INTEGER DEFAULT 0,
                resolved INTEGER DEFAULT 0
            )
        ''')
        
        # 创建索引
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_request_time ON request_metrics(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_system_time ON system_metrics(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_alert_time ON alerts(timestamp)')
        
        conn.commit()
        conn.close()
        logger.info("数据库初始化完成")
    
    def save_request_metrics(self, metrics: RequestMetrics):
        """保存请求指标"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO request_metrics 
            (request_id, timestamp, response_time_ms, success, error_type,
             prompt_tokens, completion_tokens, total_tokens, cost_usd,
             model, endpoint, user_id, session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            metrics.request_id,
            metrics.timestamp.isoformat(),
            metrics.response_time_ms,
            1 if metrics.success else 0,
            metrics.error_type,
            metrics.prompt_tokens,
            metrics.completion_tokens,
            metrics.total_tokens,
            metrics.cost_usd,
            metrics.model,
            metrics.endpoint,
            metrics.user_id,
            metrics.session_id
        ))
        
        conn.commit()
    
    def save_system_metrics(self, metrics: SystemMetrics):
        """保存系统指标"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO system_metrics 
            (timestamp, cpu_percent, memory_percent, disk_percent, network_io_bytes,
             concurrent_requests, queue_depth, active_sessions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            metrics.timestamp.isoformat(),
            metrics.cpu_percent,
            metrics.memory_percent,
            metrics.disk_percent,
            metrics.network_io_bytes,
            metrics.concurrent_requests,
            metrics.queue_depth,
            metrics.active_sessions
        ))
        
        conn.commit()
    
    def save_alert(self, rule_name: str, level: str, metric: str, 
                   current_value: float, threshold: float, message: str):
        """保存告警记录"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO alerts 
            (timestamp, rule_name, level, metric, current_value, threshold, message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            datetime.now().isoformat(),
            rule_name,
            level,
            metric,
            current_value,
            threshold,
            message
        ))
        
        conn.commit()
    
    def get_request_metrics(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        """获取指定时间范围的请求指标"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM request_metrics 
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp DESC
        ''', (start_time.isoformat(), end_time.isoformat()))
        
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    
    def get_system_metrics(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        """获取指定时间范围的系统指标"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM system_metrics 
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp DESC
        ''', (start_time.isoformat(), end_time.isoformat()))
        
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    
    def get_aggregated_metrics(self, start_time: datetime, end_time: datetime) -> Dict:
        """获取聚合指标"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        # 响应时间统计
        cursor.execute('''
            SELECT 
                AVG(response_time_ms) as avg_response_time,
                MIN(response_time_ms) as min_response_time,
                MAX(response_time_ms) as max_response_time,
                COUNT(*) as total_requests,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
                SUM(prompt_tokens) as total_prompt_tokens,
                SUM(completion_tokens) as total_completion_tokens,
                SUM(total_tokens) as total_tokens,
                SUM(cost_usd) as total_cost
            FROM request_metrics 
            WHERE timestamp >= ? AND timestamp <= ?
        ''', (start_time.isoformat(), end_time.isoformat()))
        
        result = dict(cursor.fetchone())
        
        # 计算成功率
        if result['total_requests'] > 0:
            result['success_rate'] = result['success_count'] / result['total_requests'] * 100
        else:
            result['success_rate'] = 0
        
        # 百分位数计算
        cursor.execute('''
            SELECT response_time_ms FROM request_metrics 
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY response_time_ms
        ''', (start_time.isoformat(), end_time.isoformat()))
        
        response_times = [row[0] for row in cursor.fetchall()]
        if response_times:
            result['p50_response_time'] = self._percentile(response_times, 50)
            result['p95_response_time'] = self._percentile(response_times, 95)
            result['p99_response_time'] = self._percentile(response_times, 99)
        else:
            result['p50_response_time'] = 0
            result['p95_response_time'] = 0
            result['p99_response_time'] = 0
        
        return result
    
    @staticmethod
    def _percentile(data: List[float], percentile: float) -> float:
        """计算百分位数"""
        if not data:
            return 0
        sorted_data = sorted(data)
        index = int(len(sorted_data) * percentile / 100)
        return sorted_data[min(index, len(sorted_data) - 1)]
    
    def get_active_alerts(self) -> List[Dict]:
        """获取活跃告警"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM alerts 
            WHERE resolved = 0
            ORDER BY 
                CASE level 
                    WHEN 'P0' THEN 1 
                    WHEN 'P1' THEN 2 
                    WHEN 'P2' THEN 3 
                    WHEN 'P3' THEN 4 
                END,
                timestamp DESC
        ''')
        
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


class MetricsCollector:
    """指标收集器"""
    
    def __init__(self, store: MetricsStore):
        self.store = store
        self.running = False
        self.collect_task = None
        
        # 内存中的实时指标缓存
        self.recent_requests: deque = deque(maxlen=1000)
        self.recent_system_metrics: deque = deque(maxlen=100)
    
    def record_request(self, metrics: RequestMetrics):
        """记录请求指标"""
        self.recent_requests.append(metrics)
        self.store.save_request_metrics(metrics)
        logger.debug(f"记录请求指标: {metrics.request_id}")
    
    def record_system_metrics(self, metrics: SystemMetrics):
        """记录系统指标"""
        self.recent_system_metrics.append(metrics)
        self.store.save_system_metrics(metrics)
    
    async def collect_system_metrics(self):
        """收集系统指标（需要psutil）"""
        try:
            import psutil
            
            while self.running:
                metrics = SystemMetrics(
                    timestamp=datetime.now(),
                    cpu_percent=psutil.cpu_percent(interval=1),
                    memory_percent=psutil.virtual_memory().percent,
                    disk_percent=psutil.disk_usage('/').percent,
                    network_io_bytes=psutil.net_io_counters().bytes_sent + psutil.net_io_counters().bytes_recv,
                    concurrent_requests=len(self.recent_requests),
                    queue_depth=0,  # 需要根据实际情况设置
                    active_sessions=0  # 需要根据实际情况设置
                )
                
                self.record_system_metrics(metrics)
                logger.debug(f"系统指标: CPU={metrics.cpu_percent}%, Memory={metrics.memory_percent}%")
                
                await asyncio.sleep(30)  # 每30秒收集一次
                
        except ImportError:
            logger.warning("psutil未安装，无法收集系统指标")
    
    def start(self):
        """启动收集器"""
        self.running = True
        logger.info("指标收集器已启动")
    
    def stop(self):
        """停止收集器"""
        self.running = False
        logger.info("指标收集器已停止")


class AlertManager:
    """告警管理器"""
    
    def __init__(self, store: MetricsStore):
        self.store = store
        self.rules: List[AlertRule] = []
        self.alert_history: deque = deque(maxlen=100)
        self.running = False
        
        # 默认告警规则
        self._init_default_rules()
    
    def _init_default_rules(self):
        """初始化默认告警规则"""
        default_rules = [
            AlertRule(
                name="high_response_time",
                metric="avg_response_time",
                operator=">",
                threshold=5000,  # 5秒
                duration_seconds=300,  # 持续5分钟
                level="P1",
                message_template="平均响应时间超过阈值: {current_value}ms > {threshold}ms"
            ),
            AlertRule(
                name="low_success_rate",
                metric="success_rate",
                operator="<",
                threshold=95,  # 95%
                duration_seconds=180,  # 持续3分钟
                level="P0",
                message_template="请求成功率低于阈值: {current_value}% < {threshold}%"
            ),
            AlertRule(
                name="high_error_rate",
                metric="error_rate",
                operator=">",
                threshold=5,  # 5%
                duration_seconds=300,
                level="P1",
                message_template="错误率超过阈值: {current_value}% > {threshold}%"
            ),
            AlertRule(
                name="high_cpu_usage",
                metric="cpu_percent",
                operator=">",
                threshold=85,  # 85%
                duration_seconds=600,  # 持续10分钟
                level="P2",
                message_template="CPU使用率超过阈值: {current_value}% > {threshold}%"
            ),
            AlertRule(
                name="high_memory_usage",
                metric="memory_percent",
                operator=">",
                threshold=90,  # 90%
                duration_seconds=300,
                level="P1",
                message_template="内存使用率超过阈值: {current_value}% > {threshold}%"
            ),
            AlertRule(
                name="high_cost",
                metric="daily_cost",
                operator=">",
                threshold=200,  # $200
                duration_seconds=0,
                level="P2",
                message_template="日累计成本超过阈值: ${current_value} > ${threshold}"
            ),
        ]
        
        self.rules.extend(default_rules)
    
    def add_rule(self, rule: AlertRule):
        """添加告警规则"""
        self.rules.append(rule)
        logger.info(f"添加告警规则: {rule.name}")
    
    def check_metrics(self, metrics: Dict):
        """检查指标是否触发告警"""
        for rule in self.rules:
            if not rule.enabled:
                continue
            
            if rule.metric not in metrics:
                continue
            
            current_value = metrics[rule.metric]
            triggered = False
            
            if rule.operator == ">" and current_value > rule.threshold:
                triggered = True
            elif rule.operator == "<" and current_value < rule.threshold:
                triggered = True
            elif rule.operator == ">=" and current_value >= rule.threshold:
                triggered = True
            elif rule.operator == "<=" and current_value <= rule.threshold:
                triggered = True
            elif rule.operator == "==" and current_value == rule.threshold:
                triggered = True
            
            if triggered:
                message = rule.message_template.format(
                    current_value=current_value,
                    threshold=rule.threshold
                )
                
                self._trigger_alert(rule, current_value, message)
    
    def _trigger_alert(self, rule: AlertRule, current_value: float, message: str):
        """触发告警"""
        alert_data = {
            'timestamp': datetime.now(),
            'rule_name': rule.name,
            'level': rule.level,
            'metric': rule.metric,
            'current_value': current_value,
            'threshold': rule.threshold,
            'message': message
        }
        
        self.alert_history.append(alert_data)
        self.store.save_alert(
            rule_name=rule.name,
            level=rule.level,
            metric=rule.metric,
            current_value=current_value,
            threshold=rule.threshold,
            message=message
        )
        
        logger.warning(f"告警触发 [{rule.level}]: {message}")
        
        # 这里可以添加发送通知的逻辑（邮件、Slack、短信等）
        self._send_notification(rule.level, message)
    
    def _send_notification(self, level: str, message: str):
        """发送通知"""
        # P0/P1 告警可以通过多种渠道发送
        if level in ['P0', 'P1']:
            logger.error(f"[URGENT] {message}")
            # TODO: 集成邮件、短信、Slack等通知渠道
        else:
            logger.info(f"[ALERT] {message}")
    
    def get_active_alerts(self) -> List[Dict]:
        """获取活跃告警"""
        return self.store.get_active_alerts()


class MetricsAPI:
    """指标API接口"""
    
    def __init__(self, store: MetricsStore, collector: MetricsCollector, 
                 alert_manager: AlertManager):
        self.store = store
        self.collector = collector
        self.alert_manager = alert_manager
    
    def get_dashboard_data(self) -> Dict:
        """获取仪表盘数据"""
        now = datetime.now()
        
        # 最近1小时的数据
        hour_ago = now - timedelta(hours=1)
        hour_metrics = self.store.get_aggregated_metrics(hour_ago, now)
        
        # 最近24小时的数据
        day_ago = now - timedelta(hours=24)
        day_metrics = self.store.get_aggregated_metrics(day_ago, now)
        
        # 活跃告警
        active_alerts = self.alert_manager.get_active_alerts()
        
        return {
            'current': {
                'avg_response_time': round(hour_metrics.get('avg_response_time', 0) / 1000, 2),  # 转换为秒
                'success_rate': round(hour_metrics.get('success_rate', 0), 1),
                'total_requests': hour_metrics.get('total_requests', 0),
                'total_tokens': hour_metrics.get('total_tokens', 0),
                'total_cost': round(hour_metrics.get('total_cost', 0), 2),
                'p95_response_time': round(hour_metrics.get('p95_response_time', 0) / 1000, 2),
                'p99_response_time': round(hour_metrics.get('p99_response_time', 0) / 1000, 2),
            },
            'daily': {
                'total_requests': day_metrics.get('total_requests', 0),
                'total_tokens': day_metrics.get('total_tokens', 0),
                'total_cost': round(day_metrics.get('total_cost', 0), 2),
                'avg_success_rate': round(day_metrics.get('success_rate', 0), 1),
            },
            'alerts': active_alerts,
            'timestamp': now.isoformat()
        }
    
    def get_time_series_data(self, metric: str, hours: int = 24) -> List[Dict]:
        """获取时间序列数据"""
        now = datetime.now()
        start_time = now - timedelta(hours=hours)
        
        metrics = self.store.get_request_metrics(start_time, now)
        
        # 按小时聚合
        hourly_data = {}
        for m in metrics:
            hour = m['timestamp'][:13]  # 取到小时
            if hour not in hourly_data:
                hourly_data[hour] = []
            hourly_data[hour].append(m)
        
        result = []
        for hour, data in sorted(hourly_data.items()):
            if metric == 'request_count':
                value = len(data)
            elif metric == 'avg_response_time':
                value = sum(d['response_time_ms'] for d in data) / len(data) if data else 0
            elif metric == 'success_rate':
                success_count = sum(1 for d in data if d['success'])
                value = success_count / len(data) * 100 if data else 0
            elif metric == 'total_tokens':
                value = sum(d['total_tokens'] for d in data)
            elif metric == 'total_cost':
                value = sum(d['cost_usd'] for d in data)
            else:
                value = 0
            
            result.append({
                'timestamp': hour + ':00:00',
                'value': round(value, 2)
            })
        
        return result


# 全局实例
_metrics_store: Optional[MetricsStore] = None
_metrics_collector: Optional[MetricsCollector] = None
_alert_manager: Optional[AlertManager] = None
_metrics_api: Optional[MetricsAPI] = None


def init_monitoring(db_path: str = "metrics.db"):
    """初始化监控系统"""
    global _metrics_store, _metrics_collector, _alert_manager, _metrics_api
    
    _metrics_store = MetricsStore(db_path)
    _metrics_collector = MetricsCollector(_metrics_store)
    _alert_manager = AlertManager(_metrics_store)
    _metrics_api = MetricsAPI(_metrics_store, _metrics_collector, _alert_manager)
    
    _metrics_collector.start()
    
    logger.info("监控系统初始化完成")
    return _metrics_api


def get_metrics_api() -> Optional[MetricsAPI]:
    """获取指标API实例"""
    return _metrics_api


def record_request(**kwargs):
    """记录请求指标的便捷函数"""
    if _metrics_collector:
        metrics = RequestMetrics(
            timestamp=datetime.now(),
            **kwargs
        )
        _metrics_collector.record_request(metrics)


# 示例用法
if __name__ == "__main__":
    # 初始化
    api = init_monitoring()
    
    # 模拟一些数据
    for i in range(100):
        record_request(
            request_id=f"req_{i}",
            response_time_ms=500 + i * 10,
            success=i % 10 != 0,
            prompt_tokens=100 + i,
            completion_tokens=200 + i,
            total_tokens=300 + i * 2,
            cost_usd=0.01 + i * 0.001,
            model="gpt-4",
            endpoint="/chat/completions"
        )
    
    # 获取仪表盘数据
    dashboard_data = api.get_dashboard_data()
    print(json.dumps(dashboard_data, indent=2, default=str))
