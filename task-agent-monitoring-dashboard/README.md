# Agent监控仪表盘

一个完整的Agent监控解决方案，用于实时监控AI Agent的健康度、性能和成本。

## 功能特性

### 📊 监控指标
- **响应时间**: 平均、P50/P95/P99响应时间
- **成功率**: 请求成功率、错误率、超时率
- **Token使用**: 输入/输出Token数、单次请求成本
- **系统资源**: CPU、内存、磁盘使用率
- **业务指标**: 活跃会话、并发请求数

### 🎨 可视化仪表盘
- 深色主题UI设计
- 实时数据更新
- 多维度图表展示
- 响应式布局

### 🔔 告警系统
- 多级告警（P0-P3）
- 可配置告警规则
- 告警历史记录

### 💾 数据存储
- SQLite本地存储
- 支持PostgreSQL扩展
- 数据聚合分析

## 快速开始

### 1. 纯前端体验

直接用浏览器打开 `dashboard.html` 即可查看模拟数据效果。

### 2. 完整部署

```bash
# 安装依赖
pip install psutil flask flask-cors

# 启动API服务器
python api_server.py

# 访问 http://localhost:5000
```

## 项目结构

```
task-agent-monitoring-dashboard/
├── metrics-definition.md    # 监控指标定义
├── dashboard.html           # Web仪表盘
├── metrics_collector.py     # 数据收集器
├── api_server.py            # API服务器
├── deployment.md            # 部署文档
└── README.md                # 本文件
```

## 核心指标

| 指标 | 说明 | 目标值 |
|------|------|--------|
| 平均响应时间 | 请求平均耗时 | < 2s |
| 请求成功率 | 成功请求占比 | > 99% |
| P95响应时间 | 95%请求响应时间 | < 3s |
| 日累计成本 | 每日Token成本 | < $100 |

## 集成指南

在你的Agent代码中集成监控：

```python
from metrics_collector import init_monitoring, record_request

# 初始化
api = init_monitoring()

# 记录请求
def handle_request(request_id, user_input):
    start = time.time()
    response = process(user_input)
    
    record_request(
        request_id=request_id,
        response_time_ms=(time.time() - start) * 1000,
        success=True,
        prompt_tokens=len(user_input.split()),
        completion_tokens=len(response.split()),
        cost_usd=calculate_cost(...),
        model="gpt-4"
    )
```

## API接口

- `GET /api/dashboard` - 获取仪表盘数据
- `GET /api/metrics` - 获取时间序列数据
- `GET /api/alerts` - 获取活跃告警
- `POST /api/record` - 记录请求指标

## 部署方式

- Docker: `docker build -t agent-dashboard .`
- Docker Compose: `docker-compose up -d`
- Kubernetes: `kubectl apply -f k8s-deployment.yaml`

详见 [deployment.md](deployment.md)

## 技术栈

- **前端**: HTML5, Chart.js, CSS3
- **后端**: Python, Flask
- **数据库**: SQLite (可扩展至PostgreSQL)
- **监控**: psutil

## 许可证

MIT License
