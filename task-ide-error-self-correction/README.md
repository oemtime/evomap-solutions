# IDE Error Self-Correction System

一个完整的IDE错误日志解析和自我修正系统，支持主流IDE（VSCode、IntelliJ、PyCharm等）的错误日志格式。

## 功能特性

- **多IDE支持**：自动检测并解析VSCode、IntelliJ IDEA、PyCharm等IDE的错误日志
- **智能分类**：将错误自动分类为语法错误、类型错误、导入错误、运行时错误等
- **根因分析**：深入分析错误的根本原因，提供可信度评估
- **自动修复**：基于模板的智能修复建议，支持自动应用
- **安全备份**：所有修改自动备份，支持一键回滚
- **可扩展**：插件化架构，易于添加新的IDE支持和修复模板

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/evomap/ide-error-self-correction.git
cd ide-error-self-correction

# 安装依赖（纯Python标准库，无需额外依赖）
python -m pip install -e .
```

### 基本用法

```python
from ide_error_self_correction import QuickFixer

# 你的IDE错误日志
log_text = """
File "main.py", line 5
    def hello()
              ^
SyntaxError: expected ':'
"""

# 快速分析
result = QuickFixer.analyze(log_text)
print(f"发现 {result['total_errors']} 个错误")

# 查看详细结果
for item in result['results']:
    print(f"错误: {item['error']['message']}")
    print(f"根因: {item['root_cause']['primary']}")
    print(f"修复建议: {item['suggestions'][0]['description']}")
```

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                  IDE Error Self-Correction System           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Log Parser   │→ │ Error        │→ │ Root Cause   │      │
│  │ Layer        │  │ Classifier   │  │ Analyzer     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Fix Generator                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. 日志解析器 (Parser)

```python
from ide_error_self_correction import LogParserFactory, IDEType

# 自动检测IDE类型并解析
ide_type, errors = LogParserFactory.auto_parse(log_text)

# 使用特定IDE解析器
parser = LogParserFactory.get_parser(IDEType.VSCODE)
errors = parser.parse(log_text)
```

支持解析的错误类型：
- Python: SyntaxError, ImportError, TypeError, KeyError, etc.
- JavaScript/TypeScript: TS errors, ESLint errors
- Java: 编译错误、运行时异常

### 2. 错误分类器 (Classifier)

```python
from ide_error_self_correction import ErrorClassifier

classifier = ErrorClassifier()
category = classifier.classify(error)
```

错误分类：
- `SYNTAX`: 语法错误
- `TYPE`: 类型错误
- `IMPORT`: 导入错误
- `RUNTIME`: 运行时错误
- `CONFIG`: 配置错误
- `DEPENDENCY`: 依赖错误
- `LINTING`: 代码风格错误

### 3. 根因分析器 (RootCauseAnalyzer)

```python
from ide_error_self_correction import RootCauseAnalyzer

analyzer = RootCauseAnalyzer()
cause = analyzer.analyze(error)

print(f"主要原因: {cause.primary_cause}")
print(f"可信度: {cause.confidence:.0%}")
```

### 4. 修复生成器 (FixGenerator)

```python
from ide_error_self_correction import IDESelfCorrectionSystem

system = IDESelfCorrectionSystem()

# 解析并生成修复
_, errors = system.parse_log(log_text)
root_causes = system.analyze_root_causes(errors)
fixes = system.generate_fixes(errors, [rc for _, rc in root_causes])

for error, suggestions in fixes:
    print(f"错误: {error.message}")
    for suggestion in suggestions:
        print(f"  建议: {suggestion.description}")
        print(f"  置信度: {suggestion.confidence:.0%}")
```

## 完整流程示例

```python
from ide_error_self_correction import IDESelfCorrectionSystem

# 创建系统实例
system = IDESelfCorrectionSystem()

# 模拟IDE错误日志
log_text = """
File "app.py", line 10
    if user.is_active
                    ^
SyntaxError: expected ':'

ModuleNotFoundError: No module named 'requests'

File "utils.py", line 25
    data = config['api_key']
KeyError: 'api_key'
"""

# 完整处理流程
result = system.process_log(log_text)

# 查看结果
print(f"IDE类型: {result['ide_type']}")
print(f"错误总数: {result['total_errors']}")
print(f"分类统计: {result['errors_by_category']}")

for item in result['results']:
    error = item['error']
    print(f"\n错误: {error['error_type']}")
    print(f"  消息: {error['message']}")
    print(f"  根因: {item['root_cause']['primary']}")
    if item['suggestions']:
        print(f"  修复: {item['suggestions'][0]['description']}")
```

## 配置

### 系统配置 (`config/system_config.json`)

```json
{
  "system": {
    "backup_dir": ".ide_fix_backups",
    "auto_backup": true
  },
  "parser": {
    "supported_ides": ["vscode", "intellij", "pycharm"],
    "auto_detect": true
  },
  "fix_generator": {
    "max_suggestions": 3,
    "require_confirmation_for": ["syntax", "compilation"]
  }
}
```

### 修复模板 (`config/fix_templates.json`)

系统内置了丰富的修复模板，支持：
- Python语法错误（缺少冒号、未关闭字符串等）
- 导入错误（模块未安装、导入名称错误等）
- 类型错误（NoneType错误、类型不匹配等）
- 运行时错误（索引越界、KeyError等）
- JavaScript/TypeScript错误
- Java编译和运行时错误

## 测试

```bash
# 运行所有测试
python -m pytest tests/

# 运行特定测试
python -m pytest tests/test_system.py::TestLogParser

# 运行示例
python examples/usage_examples.py
```

## 项目结构

```
evomap/task-ide-error-self-correction/
├── src/                          # 核心源代码
│   ├── __init__.py              # 模块入口
│   ├── models.py                # 数据模型
│   ├── parser.py                # 日志解析器
│   ├── classifier.py            # 错误分类器和根因分析器
│   ├── fix_generator.py         # 修复生成器
│   └── core.py                  # 主控制器
├── config/                       # 配置文件
│   ├── system_config.json       # 系统配置
│   └── fix_templates.json       # 修复模板
├── tests/                        # 测试用例
│   └── test_system.py           # 系统测试
├── examples/                     # 使用示例
│   └── usage_examples.py        # 示例代码
├── docs/                         # 文档
│   └── architecture.md          # 架构设计文档
└── README.md                     # 本文件
```

## API参考

### QuickFixer 快速修复类

```python
# 快速解析
errors = QuickFixer.parse(log_text)

# 快速分析
result = QuickFixer.analyze(log_text)

# 快速修复（带确认）
results = QuickFixer.fix(log_text, confirm=True)
```

### IDESelfCorrectionSystem 主类

```python
system = IDESelfCorrectionSystem()

# 解析日志
ide_type, errors = system.parse_log(log_text, ide_type=None)

# 分类错误
classified = system.classify_errors(errors)

# 分析根因
root_causes = system.analyze_root_causes(errors)

# 生成修复
fixes = system.generate_fixes(errors, root_causes)

# 应用修复
result = system.apply_fix(error, fix_suggestion, confirm=True)

# 完整流程
result = system.process_log(log_text, auto_fix=False)

# 获取统计
stats = system.get_statistics()

# 清理备份
system.cleanup_backups(days=7)
```

## 支持的IDE

| IDE | 状态 | 支持的错误类型 |
|-----|------|---------------|
| VSCode | ✅ 完整支持 | Python, JavaScript, TypeScript |
| IntelliJ IDEA | ✅ 完整支持 | Java, Kotlin |
| PyCharm | ✅ 完整支持 | Python |
| WebStorm | ✅ 完整支持 | JavaScript, TypeScript |
| Android Studio | ✅ 完整支持 | Java, Kotlin |

## 扩展开发

### 添加新的IDE解析器

```python
from ide_error_self_correction import BaseLogParser, IDEType

class MyIDELogParser(BaseLogParser):
    def __init__(self):
        super().__init__(IDEType.MY_IDE)
    
    def _init_patterns(self):
        # 定义错误匹配模式
        pass
    
    def parse(self, log_text: str) -> List[IDEParsedError]:
        # 实现解析逻辑
        pass
    
    def can_parse(self, log_text: str) -> bool:
        # 检测是否可解析此日志
        pass

# 注册解析器
LogParserFactory.register_parser(IDEType.MY_IDE, MyIDELogParser)
```

### 添加新的修复模板

```python
from ide_error_self_correction import FixTemplate

template = FixTemplate(
    name="my_fix",
    applies_to=[ErrorCategory.SYNTAX],
    pattern=r"expected 'foo'",
    fix_generator=my_fix_generator
)

fix_generator.templates.append(template)
```

## 贡献

欢迎提交Issue和PR！

## 许可证

MIT License

## 作者

EvoMap Team

---

**注**：本系统由AI Agent开发，用于自动化IDE错误处理和代码修复。
