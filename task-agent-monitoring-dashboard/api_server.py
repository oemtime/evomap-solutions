#!/usr/bin/env python3
"""
Agent监控仪表盘 - API服务器
提供RESTful API接口供前端调用
"""

import json
import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

from metrics_collector import (
    init_monitoring, get_metrics_api, record_request, 
    RequestMetrics, SystemMetrics, MetricsStore
)

# 创建Flask应用
app = Flask(__name__)
CORS(app)  # 启用跨域支持

# 初始化监控
DB_PATH = os.environ.get('DB_PATH', 'metrics.db')
api = init_monitoring(DB_PATH)


@app.route('/')
def index():
    """首页 - 返回仪表盘HTML"""
    with open('dashboard.html', 'r', encoding='utf-8') as f:
        return f.read()


@app.route('/api/dashboard')
def get_dashboard():
    """获取仪表盘数据"""
    try:
        data = api.get_dashboard_data()
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/metrics')
def get_metrics():
    """获取时间序列数据"""
    try:
        metric = request.args.get('metric', 'avg_response_time')
        hours = int(request.args.get('hours', 24))
        
        data = api.get_time_series_data(metric, hours)
        return jsonify({
            'success': True,
            'metric': metric,
            'hours': hours,
            'data': data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/alerts')
def get_alerts():
    """获取活跃告警"""
    try:
        alerts = api.alert_manager.get_active_alerts()
        return jsonify({
            'success': True,
            'count': len(alerts),
            'alerts': alerts
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/record', methods=['POST'])
def record_metrics():
    """记录请求指标"""
    try:
        data = request.json
        
        record_request(
            request_id=data.get('request_id'),
            response_time_ms=data.get('response_time_ms', 0),
            success=data.get('success', True),
            error_type=data.get('error_type'),
            prompt_tokens=data.get('prompt_tokens', 0),
            completion_tokens=data.get('completion_tokens', 0),
            total_tokens=data.get('total_tokens', 0),
            cost_usd=data.get('cost_usd', 0),
            model=data.get('model', ''),
            endpoint=data.get('endpoint', ''),
            user_id=data.get('user_id'),
            session_id=data.get('session_id')
        )
        
        return jsonify({
            'success': True,
            'message': 'Metrics recorded successfully'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/stats')
def get_stats():
    """获取统计信息"""
    try:
        now = datetime.now()
        
        # 今日统计
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_metrics = api.store.get_aggregated_metrics(today_start, now)
        
        # 本周统计
        week_start = now - timedelta(days=7)
        week_metrics = api.store.get_aggregated_metrics(week_start, now)
        
        # 本月统计
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_metrics = api.store.get_aggregated_metrics(month_start, now)
        
        return jsonify({
            'success': True,
            'data': {
                'today': {
                    'requests': today_metrics.get('total_requests', 0),
                    'success_rate': round(today_metrics.get('success_rate', 0), 2),
                    'avg_response_time': round(today_metrics.get('avg_response_time', 0) / 1000, 2),
                    'total_tokens': today_metrics.get('total_tokens', 0),
                    'total_cost': round(today_metrics.get('total_cost', 0), 2)
                },
                'week': {
                    'requests': week_metrics.get('total_requests', 0),
                    'success_rate': round(week_metrics.get('success_rate', 0), 2),
                    'avg_response_time': round(week_metrics.get('avg_response_time', 0) / 1000, 2),
                    'total_tokens': week_metrics.get('total_tokens', 0),
                    'total_cost': round(week_metrics.get('total_cost', 0), 2)
                },
                'month': {
                    'requests': month_metrics.get('total_requests', 0),
                    'success_rate': round(month_metrics.get('success_rate', 0), 2),
                    'avg_response_time': round(month_metrics.get('avg_response_time', 0) / 1000, 2),
                    'total_tokens': month_metrics.get('total_tokens', 0),
                    'total_cost': round(month_metrics.get('total_cost', 0), 2)
                }
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/health')
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })


# 模拟数据生成器（用于演示）
def generate_mock_data():
    """生成模拟数据用于演示"""
    import random
    from datetime import datetime, timedelta
    
    models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet']
    endpoints = ['/chat/completions', '/embeddings', '/completions']
    
    # 生成最近24小时的数据
    for i in range(100):
        timestamp = datetime.now() - timedelta(hours=random.randint(0, 24))
        
        record_request(
            request_id=f"mock_req_{i}",
            response_time_ms=random.gauss(1200, 400),  # 正态分布
            success=random.random() > 0.02,  # 98%成功率
            error_type=None if random.random() > 0.02 else 'timeout',
            prompt_tokens=random.randint(50, 500),
            completion_tokens=random.randint(100, 800),
            total_tokens=random.randint(150, 1300),
            cost_usd=random.uniform(0.001, 0.05),
            model=random.choice(models),
            endpoint=random.choice(endpoints),
            user_id=f"user_{random.randint(1, 10)}",
            session_id=f"session_{random.randint(1, 50)}"
        )
    
    print("模拟数据生成完成")


if __name__ == '__main__':
    # 生成模拟数据（仅用于演示）
    if os.environ.get('GENERATE_MOCK_DATA', 'false').lower() == 'true':
        generate_mock_data()
    
    # 启动服务器
    port = int(os.environ.get('DASHBOARD_PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    print(f"Starting Agent Monitoring Dashboard on port {port}")
    print(f"Dashboard URL: http://localhost:{port}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
