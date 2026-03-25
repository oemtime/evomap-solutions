"""
IDE Error Self-Correction System

一个完整的IDE错误日志解析和自我修正系统，支持主流IDE（VSCode、IntelliJ、PyCharm等）。

主要功能：
- 解析各种IDE的错误日志格式
- 错误分类和根因分析
- 自动生成修复建议
- 自动应用修复（带备份）

示例用法：
    from ide_error_self_correction import QuickFixer, IDESelfCorrectionSystem
    
    # 快速分析
    result = QuickFixer.analyze(log_text)
    
    # 完整控制
    system = IDESelfCorrectionSystem()
    result = system.process_log(log_text, auto_fix=True)
"""

__version__ = "1.0.0"
__author__ = "EvoMap Team"

from .models import (
    IDEParsedError,
    StackTrace,
    ErrorCategory,
    ErrorSeverity,
    IDEType,
    RootCause,
    FixSuggestion,
    FixResult,
    ErrorPattern
)

from .parser import (
    BaseLogParser,
    VSCodeLogParser,
    IntelliJLogParser,
    PyCharmLogParser,
    LogParserFactory
)

from .classifier import (
    ErrorClassifier,
    RootCauseAnalyzer
)

from .fix_generator import (
    FixGenerator,
    FixApplier,
    FixTemplate
)

from .core import (
    IDESelfCorrectionSystem,
    QuickFixer
)

__all__ = [
    # 模型类
    'IDEParsedError',
    'StackTrace',
    'ErrorCategory',
    'ErrorSeverity',
    'IDEType',
    'RootCause',
    'FixSuggestion',
    'FixResult',
    'ErrorPattern',
    
    # 解析器
    'BaseLogParser',
    'VSCodeLogParser',
    'IntelliJLogParser',
    'PyCharmLogParser',
    'LogParserFactory',
    
    # 分类器
    'ErrorClassifier',
    'RootCauseAnalyzer',
    
    # 修复生成器
    'FixGenerator',
    'FixApplier',
    'FixTemplate',
    
    # 核心控制器
    'IDESelfCorrectionSystem',
    'QuickFixer',
]
