"""
IDE Error Self-Correction System
使用示例
"""

from ide_error_self_correction import (
    IDESelfCorrectionSystem,
    QuickFixer,
    IDEType,
    LogParserFactory
)


def example_1_basic_usage():
    """示例1：基本用法 - 快速分析"""
    print("=" * 60)
    print("示例1：基本用法 - 快速分析")
    print("=" * 60)
    
    # 模拟Python错误日志
    python_log = '''
File "calculator.py", line 5
    def add(a, b)
                ^
SyntaxError: expected ':'

File "calculator.py", line 12
    result = data['total']
KeyError: 'total'
'''
    
    # 快速分析
    result = QuickFixer.analyze(python_log)
    
    print(f"检测到的IDE类型: {result['ide_type']}")
    print(f"发现错误数量: {result['total_errors']}")
    print(f"错误分类: {result['errors_by_category']}")
    print()
    
    # 打印详细结果
    for i, item in enumerate(result['results'], 1):
        print(f"错误 #{i}:")
        print(f"  类型: {item['error']['error_type']}")
        print(f"  消息: {item['error']['message']}")
        print(f"  根因: {item['root_cause']['primary']}")
        print(f"  修复建议:")
        for j, suggestion in enumerate(item['suggestions'], 1):
            print(f"    {j}. {suggestion['description']} (置信度: {suggestion['confidence']:.0%})")
        print()


def example_2_custom_parser():
    """示例2：使用特定的解析器"""
    print("=" * 60)
    print("示例2：使用特定的解析器")
    print("=" * 60)
    
    # 模拟TypeScript错误日志
    ts_log = '''
src/components/Button.tsx:15:10 - error TS2322: Type 'string' is not assignable to type 'number'.

15     const count: number = "hello";
            ~~~~~
src/utils/helpers.ts:8:5 - error TS2345: Argument of type 'any' is not assignable to parameter of type 'string'.
'''
    
    # 创建系统实例，指定IDE类型
    system = IDESelfCorrectionSystem()
    
    # 使用特定IDE类型解析
    ide_type, errors = system.parse_log(ts_log, ide_type=IDEType.VSCODE)
    
    print(f"使用解析器: {ide_type.value}")
    print(f"解析到 {len(errors)} 个错误")
    
    for error in errors:
        print(f"  - {error.error_type}: {error.message}")
        print(f"    位置: {error.file_path}:{error.line_number}")
    print()


def example_3_root_cause_analysis():
    """示例3：根因分析"""
    print("=" * 60)
    print("示例3：根因分析")
    print("=" * 60)
    
    log = '''
Traceback (most recent call last):
  File "app.py", line 25, in process_data
    user = get_user(user_id)
  File "database.py", line 42, in get_user
    return db.query(User).filter(User.id == user_id).first()
AttributeError: 'NoneType' object has no attribute 'query'
'''
    
    system = IDESelfCorrectionSystem()
    _, errors = system.parse_log(log)
    root_causes = system.analyze_root_causes(errors)
    
    for error, cause in root_causes:
        print(f"错误: {error.error_type}")
        print(f"  消息: {error.message}")
        print(f"  根因分析:")
        print(f"    主要原因: {cause.primary_cause}")
        print(f"    次要原因: {', '.join(cause.secondary_causes) or '无'}")
        print(f"    可信度: {cause.confidence:.0%}")
        if cause.evidence:
            print(f"    证据: {', '.join(cause.evidence)}")
    print()


def example_4_generate_fixes():
    """示例4：生成修复建议"""
    print("=" * 60)
    print("示例4：生成修复建议")
    print("=" * 60)
    
    log = '''
File "main.py", line 8
    if user.is_active
                    ^
SyntaxError: expected ':'

File "main.py", line 15
    data = config['database_url']
KeyError: 'database_url'
'''
    
    system = IDESelfCorrectionSystem()
    _, errors = system.parse_log(log)
    root_causes = system.analyze_root_causes(errors)
    fixes = system.generate_fixes(errors, [rc for _, rc in root_causes])
    
    for error, suggestions in fixes:
        print(f"错误: {error.error_type} - {error.message}")
        print(f"  位置: {error.file_path}:{error.line_number}")
        print(f"  修复建议:")
        
        for i, suggestion in enumerate(suggestions[:3], 1):
            print(f"    {i}. {suggestion.description}")
            print(f"       解释: {suggestion.explanation}")
            print(f"       置信度: {suggestion.confidence:.0%}")
            print(f"       需要确认: {'是' if suggestion.requires_confirmation else '否'}")
            
            if suggestion.code_changes:
                print(f"       代码变更:")
                for change in suggestion.code_changes:
                    if "file" in change and change["file"] != "TERMINAL_COMMAND":
                        print(f"         - {change.get('file')} 第 {change.get('line_start')}-{change.get('line_end')} 行")
        print()


def example_5_process_with_auto_fix():
    """示例5：自动应用修复"""
    print("=" * 60)
    print("示例5：自动应用修复（演示模式）")
    print("=" * 60)
    
    log = '''
File "example.py", line 3
    def greet(name)
                 ^
SyntaxError: expected ':'
'''
    
    system = IDESelfCorrectionSystem()
    
    # 演示模式：不实际应用修复
    result = system.process_log(log, auto_fix=False)
    
    print(f"处理结果:")
    print(f"  状态: {result['status']}")
    print(f"  错误总数: {result['total_errors']}")
    
    for item in result['results']:
        error = item['error']
        print(f"\n  错误: {error['error_type']}")
        print(f"    位置: {error['file_path']}:{error['line_number']}")
        print(f"    可自动修复: {'是' if item['can_auto_fix'] else '否'}")
        
        if item['suggestions']:
            best_fix = item['suggestions'][0]
            print(f"    最佳修复: {best_fix['description']}")
            print(f"    修复代码:")
            for change in best_fix.get('code_changes', []):
                if 'replacement' in change:
                    print(f"      -> {change['replacement']}")
    print()


def example_6_java_errors():
    """示例6：Java错误解析"""
    print("=" * 60)
    print("示例6：Java错误解析")
    print("=" * 60)
    
    java_log = '''
Main.java:15: error: cannot find symbol
        String message = greet(name);
                         ^
  symbol:   method greet(String)
  location: class Main

Main.java:22: error: incompatible types: int cannot be converted to String
        String num = 42;
                     ^
'''
    
    system = IDESelfCorrectionSystem()
    ide_type, errors = system.parse_log(java_log, IDEType.INTELLIJ)
    
    print(f"检测到的IDE类型: {ide_type.value}")
    print(f"解析到 {len(errors)} 个错误")
    
    for error in errors:
        print(f"\n  错误类型: {error.error_type}")
        print(f"  消息: {error.message}")
        print(f"  文件: {error.file_path}:{error.line_number}")
    print()


def example_7_statistics():
    """示例7：统计信息"""
    print("=" * 60)
    print("示例7：统计信息")
    print("=" * 60)
    
    system = IDESelfCorrectionSystem()
    
    # 处理多个日志
    logs = [
        'File "a.py", line 1\n    x =\n       ^\nSyntaxError: invalid syntax',
        'ModuleNotFoundError: No module named "requests"',
        'File "b.py", line 5\n    data[key]\nKeyError: "key"',
    ]
    
    for log in logs:
        system.process_log(log)
    
    stats = system.get_statistics()
    print(f"系统统计信息:")
    print(f"  总共解析: {stats['total_parsed']} 个错误")
    print(f"  成功修复: {stats['total_fixed']} 个")
    print(f"  修复失败: {stats['total_failed']} 个")
    print(f"  成功率: {stats['success_rate']:.1%}")
    print()


def example_8_batch_processing():
    """示例8：批量处理"""
    print("=" * 60)
    print("示例8：批量处理")
    print("=" * 60)
    
    # 模拟包含多种错误的复杂日志
    complex_log = '''
===== Python Syntax Errors =====
File "app.py", line 10
    def calculate()
                 ^
SyntaxError: expected ':'

File "app.py", line 25
    for i in range(10)
                      ^
SyntaxError: expected ':'

===== Import Errors =====
ModuleNotFoundError: No module named 'pandas'

===== Runtime Errors =====
File "utils.py", line 30, in get_config
    return settings[env]
KeyError: 'production'

File "database.py", line 45, in connect
    cursor.execute(query)
AttributeError: 'NoneType' object has no attribute 'execute'
'''
    
    system = IDESelfCorrectionSystem()
    result = system.process_log(complex_log)
    
    print(f"批量处理结果:")
    print(f"  总错误数: {result['total_errors']}")
    print(f"  按分类统计:")
    for category, count in result['errors_by_category'].items():
        print(f"    - {category}: {count} 个")
    
    # 统计可自动修复的错误
    auto_fixable = sum(1 for item in result['results'] if item['can_auto_fix'])
    print(f"  可自动修复: {auto_fixable} 个")
    print()


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("IDE Error Self-Correction System - 使用示例")
    print("=" * 60 + "\n")
    
    # 运行所有示例
    example_1_basic_usage()
    example_2_custom_parser()
    example_3_root_cause_analysis()
    example_4_generate_fixes()
    example_5_process_with_auto_fix()
    example_6_java_errors()
    example_7_statistics()
    example_8_batch_processing()
    
    print("=" * 60)
    print("所有示例运行完毕！")
    print("=" * 60)
