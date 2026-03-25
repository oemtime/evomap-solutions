"""
Vim 插件示例 - TypeScript Agent 集成

使用方法:
1. 将此文件放入 ~/.vim/plugin/typescript_agent.vim
2. 确保已安装 typescript-agent-lsp: pip install typescript-agent-lsp
3. 在 .vimrc 中添加配置
"""

import vim
import json
import sys
import os

# 添加 TypeScript Agent 到路径
sys.path.insert(0, os.path.expanduser('~/.vim/typescript-agent'))

try:
    from typescript_agent_lsp import TypeScriptAgent, TypeScriptAgentConfig
    AGENT_AVAILABLE = True
except ImportError:
    AGENT_AVAILABLE = False
    print("TypeScript Agent not available. Install with: pip install typescript-agent-lsp")

# 全局 agent 实例
_agent = None

def get_agent():
    """获取或创建 agent 实例"""
    global _agent
    
    if _agent is None and AGENT_AVAILABLE:
        workspace_root = vim.eval('getcwd()')
        config = TypeScriptAgentConfig(
            lsp={
                'serverPath': vim.eval('g:typescript_agent_server_path'),
                'rootPath': workspace_root,
                'onLog': lambda msg, level: print(f'[TS Agent] {msg}')
            },
            features={
                'typeInference': True,
                'errorDetection': True,
                'codeCompletion': True,
                'refactoring': True,
                'autoFix': True
            },
            editor='vim'
        )
        _agent = TypeScriptAgent(config)
    
    return _agent

def ts_agent_start():
    """启动 TypeScript Agent"""
    agent = get_agent()
    if agent:
        try:
            agent.start()
            print("TypeScript Agent started")
        except Exception as e:
            print(f"Failed to start TypeScript Agent: {e}")

def ts_agent_stop():
    """停止 TypeScript Agent"""
    global _agent
    if _agent:
        _agent.stop()
        _agent = None
        print("TypeScript Agent stopped")

def ts_agent_show_type():
    """显示光标位置的类型"""
    agent = get_agent()
    if not agent:
        return
    
    buffer = vim.current.buffer
    (row, col) = vim.current.window.cursor
    file_path = buffer.name
    
    try:
        type_info = agent.get_type_at_position(file_path, row - 1, col)
        if type_info:
            if type_info.get('name'):
                print(f"{type_info['name']}: {type_info['type']}")
            else:
                print(type_info['type'])
        else:
            print("No type information available")
    except Exception as e:
        print(f"Error: {e}")

def ts_agent_show_errors():
    """显示当前文件的错误"""
    agent = get_agent()
    if not agent:
        return
    
    buffer = vim.current.buffer
    file_path = buffer.name
    
    try:
        errors = agent.get_errors(file_path)
        if not errors:
            print("No errors found!")
            return
        
        # 创建 quickfix 列表
        qflist = []
        for error in errors:
            qflist.append({
                'filename': file_path,
                'lnum': error['range']['start']['line'] + 1,
                'col': error['range']['start']['character'] + 1,
                'text': f"[{error['severity'].upper()}] {error['message']}",
                'type': error['severity'][0].upper()
            })
        
        vim.eval(f'setqflist({json.dumps(qflist)})')
        vim.command('copen')
        print(f"Found {len(errors)} error(s)")
    except Exception as e:
        print(f"Error: {e}")

def ts_agent_fix_all():
    """修复所有可自动修复的错误"""
    agent = get_agent()
    if not agent:
        return
    
    buffer = vim.current.buffer
    file_path = buffer.name
    
    try:
        result = agent.fix_all(file_path)
        print(f"Fixed {result['applied']} error(s), {result['failed']} failed")
        
        # 刷新缓冲区
        vim.command('edit')
    except Exception as e:
        print(f"Error: {e}")

def ts_agent_complete():
    """获取代码补全"""
    agent = get_agent()
    if not agent:
        return []
    
    buffer = vim.current.buffer
    (row, col) = vim.current.window.cursor
    file_path = buffer.name
    
    try:
        completions = agent.get_completions(file_path, row - 1, col)
        
        # 转换为 Vim 补全格式
        vim_completions = []
        for c in completions:
            label = c['label'] if isinstance(c['label'], str) else c['label']['label']
            vim_completions.append({
                'word': label,
                'menu': c.get('detail', ''),
                'info': c.get('documentation', ''),
                'kind': c.get('kind', 0)
            })
        
        return vim_completions
    except Exception as e:
        print(f"Error: {e}")
        return []

def ts_agent_goto_definition():
    """跳转到定义"""
    agent = get_agent()
    if not agent:
        return
    
    buffer = vim.current.buffer
    (row, col) = vim.current.window.cursor
    file_path = buffer.name
    
    try:
        locations = agent.goto_definition(file_path, row - 1, col)
        if locations and len(locations) > 0:
            loc = locations[0]
            vim.command(f'edit {loc["uri"].replace("file://", "")}')
            vim.current.window.cursor = (
                loc['range']['start']['line'] + 1,
                loc['range']['start']['character']
            )
        else:
            print("No definition found")
    except Exception as e:
        print(f"Error: {e}")

# 导出函数供 Vim 调用
ts_agent_start = ts_agent_start
ts_agent_stop = ts_agent_stop
ts_agent_show_type = ts_agent_show_type
ts_agent_show_errors = ts_agent_show_errors
ts_agent_fix_all = ts_agent_fix_all
ts_agent_complete = ts_agent_complete
ts_agent_goto_definition = ts_agent_goto_definition
