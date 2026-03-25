# Agent监控仪表盘 - 部署文档

## 项目概述

这是一个完整的Agent监控仪表盘系统，包含：
- 监控指标体系定义
- Web可视化仪表盘
- 数据收集器
- 告警机制

## 项目结构

```
task-agent-monitoring-dashboard/
├── metrics-definition.md    # 监控指标定义文档
├── dashboard.html           # Web仪表盘（单文件，可直接打开）
├── metrics_collector.py     # Python数据收集器
├── api_server.py            # API服务器（可选）
├── README.md                # 项目说明
└── deployment.md            # 本部署文档
```

## 快速开始

### 方式一：纯前端仪表盘（最简单）

1. 直接用浏览器打开 `dashboard.html`
2. 仪表盘使用模拟数据展示
3. 适合快速查看UI效果

```bash
# 使用Python简单HTTP服务器（可选）
cd task-agent-monitoring-dashboard
python3 -m http.server 8080
# 然后访问 http://localhost:8080/dashboard.html
```

### 方式二：完整部署（推荐）

#### 1. 环境要求

- Python 3.8+
- pip

#### 2. 安装依赖

```bash
pip install psutil flask flask-cors
```

#### 3. 启动数据收集器

```bash
python3 metrics_collector.py
```

#### 4. 启动API服务器

```bash
python3 api_server.py
```

#### 5. 访问仪表盘

打开浏览器访问 `http://localhost:5000`

## 详细部署指南

### Docker部署

#### 1. 创建Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
RUN pip install psutil flask flask-cors

# 复制项目文件
COPY . /app/

# 暴露端口
EXPOSE 5000

# 启动命令
CMD ["python", "api_server.py"]
```

#### 2. 构建并运行

```bash
# 构建镜像
docker build -t agent-dashboard .

# 运行容器
docker run -d -p 5000:5000 -v $(pwd)/data:/app/data agent-dashboard
```

### Docker Compose部署

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  agent-dashboard:
    build: .
    ports:
      - "5000:5000"
    volumes:
      - ./data:/app/data
    environment:
      - FLASK_ENV=production
    restart: unless-stopped
```

运行：

```bash
docker-compose up -d
```

### Kubernetes部署

创建 `k8s-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-dashboard
spec:
  replicas: 1
  selector:
    matchLabels:
      app: agent-dashboard
  template:
    metadata:
      labels:
        app: agent-dashboard
    spec:
      containers:
      - name: dashboard
        image: agent-dashboard:latest
        ports:
        - containerPort: 5000
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: agent-dashboard
spec:
  selector:
    app: agent-dashboard
  ports:
  - port: 80
    targetPort: 5000
  type: ClusterIP
```

部署：

```bash
kubectl apply -f k8s-deployment.yaml
```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DASHBOARD_PORT` | 5000 | API服务器端口 |
| `DB_PATH` | metrics.db | SQLite数据库路径 |
| `LOG_LEVEL` | INFO | 日志级别 |
| `ALERT_WEBHOOK_URL` | - | 告警Webhook地址 |

### 告警规则配置

在 `metrics_collector.py` 中修改 `AlertManager._init_default_rules()` 方法：

```python
def _init_default_rules(self):
    custom_rules = [
        AlertRule(
            name="custom_rule",
            metric="avg_response_time",
            operator=">",
            threshold=3000,  # 3秒
            duration_seconds=180,
            level="P1",
            message_template="自定义告警: {current_value}ms > {threshold}ms"
        ),
    ]
    self.rules.extend(custom_rules)
```

### 集成到现有Agent

在你的Agent代码中集成监控：

```python
from metrics_collector import init_monitoring, record_request, get_metrics_api

# 初始化监控
api = init_monitoring("/path/to/metrics.db")

# 在请求处理中记录指标
def handle_request(request_id, user_input):
    start_time = time.time()
    
    try:
        # 处理请求
        response = process_request(user_input)
        
        # 记录成功指标
        record_request(
            request_id=request_id,
            response_time_ms=(time.time() - start_time) * 1000,
            success=True,
            prompt_tokens=len(user_input.split()),
            completion_tokens=len(response.split()),
            total_tokens=len(user_input.split()) + len(response.split()),
            cost_usd=calculate_cost(...),
            model="gpt-4",
            endpoint="/chat"
        )
        
        return response
        
    except Exception as e:
        # 记录失败指标
        record_request(
            request_id=request_id,
            response_time_ms=(time.time() - start_time) * 1000,
            success=False,
            error_type=type(e).__name__,
            ...
        )
        raise
```

## API接口说明

### 获取仪表盘数据

```http
GET /api/dashboard
```

响应：

```json
{
  "current": {
    "avg_response_time": 1.24,
    "success_rate": 99.8,
    "total_requests": 1250,
    "total_tokens": 2400000,
    "total_cost": 45.20,
    "p95_response_time": 2.8,
    "p99_response_time": 4.2
  },
  "daily": {
    "total_requests": 15000,
    "total_tokens": 28000000,
    "total_cost": 520.50,
    "avg_success_rate": 99.5
  },
  "alerts": [...],
  "timestamp": "2024-01-15T10:30:00"
}
```

### 获取时间序列数据

```http
GET /api/metrics?metric=avg_response_time&hours=24
```

### 获取活跃告警

```http
GET /api/alerts
```

## 监控指标说明

### 核心性能指标

| 指标 | 说明 | 正常范围 | 告警阈值 |
|------|------|----------|----------|
| avg_response_time | 平均响应时间 | < 2s | > 5s |
| success_rate | 请求成功率 | > 99% | < 95% |
| p95_response_time | 95分位响应时间 | < 3s | > 8s |
| error_rate | 错误率 | < 1% | > 5% |

### 成本指标

| 指标 | 说明 | 正常范围 | 告警阈值 |
|------|------|----------|----------|
| daily_cost | 日累计成本 | < $100 | > $200 |
| tokens_per_request | 单次Token数 | < 2000 | > 4000 |

### 系统健康指标

| 指标 | 说明 | 正常范围 | 告警阈值 |
|------|------|----------|----------|
| cpu_percent | CPU使用率 | < 70% | > 85% |
| memory_percent | 内存使用率 | < 80% | > 90% |

## 故障排查

### 常见问题

#### 1. 仪表盘显示空白

- 检查浏览器控制台是否有JavaScript错误
- 确认Chart.js CDN可访问
- 尝试刷新页面

#### 2. 数据不更新

- 检查 `metrics_collector.py` 是否正常运行
- 检查数据库文件是否有写入权限
- 查看日志输出

#### 3. 告警不触发

- 检查告警规则是否正确配置
- 确认阈值设置是否合理
- 检查告警级别是否启用

### 日志查看

```bash
# 查看实时日志
tail -f metrics.log

# 查看错误日志
grep ERROR metrics.log
```

## 性能优化

### 数据库优化

对于高并发场景，建议：

1. 使用PostgreSQL替代SQLite
2. 添加数据库连接池
3. 定期归档历史数据

### 仪表盘优化

1. 增加数据缓存
2. 使用WebSocket推送实时数据
3. 分页加载历史数据

## 安全建议

1. **访问控制**: 添加身份验证机制
2. **HTTPS**: 生产环境使用HTTPS
3. **CORS**: 正确配置跨域策略
4. **数据脱敏**: 敏感信息打码处理

## 扩展开发

### 添加自定义图表

在 `dashboard.html` 中添加新的Chart.js配置：

```javascript
const customCtx = document.getElementById('customChart').getContext('2d');
new Chart(customCtx, {
    type: 'line',
    data: { ... },
    options: { ... }
});
```

### 添加自定义指标

在 `metrics_collector.py` 中：

1. 添加新的数据类
2. 实现收集逻辑
3. 添加存储方法
4. 在API中暴露

## 更新日志

### v1.0.0
- 初始版本发布
- 基础监控指标
- Web仪表盘
- 告警系统

## 支持与反馈

如有问题或建议，请通过以下方式联系：
- 提交Issue
- 发送邮件
- 联系开发团队
