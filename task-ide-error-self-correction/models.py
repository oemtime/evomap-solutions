"""
IDE Error Self-Correction System
核心模块 - 数据模型定义
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Callable
from enum import Enum, auto
from datetime import datetime


class ErrorSeverity(Enum):
    """错误严重程度"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class ErrorCategory(Enum):
    """错误分类"""
    SYNTAX = "syntax"
    TYPE = "type"
    IMPORT = "import"
    RUNTIME = "runtime"
    CONFIG = "config"
    DEPENDENCY = "dependency"
    LINTING = "linting"
    COMPILATION = "compilation"
    UNKNOWN = "unknown"


class IDEType(Enum):
    """支持的IDE类型"""
    VSCODE = "vscode"
    INTELLIJ = "intellij"
    PYCHARM = "pycharm"
    WEBSTORM = "webstorm"
    ANDROID_STUDIO = "android_studio"
    UNKNOWN = "unknown"


@dataclass
class StackTrace:
    """堆栈跟踪信息"""
    file_path: str
    line_number: int
    column_number: Optional[int] = None
    function_name: Optional[str] = None
    code_snippet: Optional[str] = None
    
    def __str__(self) -> str:
        col_str = f":{self.column_number}" if self.column_number else ""
        func_str = f" in {self.function_name}" if self.function_name else ""
        return f"  File \"{self.file_path}\", line {self.line_number}{col_str}{func_str}"


@dataclass
class IDEParsedError:
    """解析后的IDE错误"""
    raw_message: str
    ide_type: IDEType
    error_type: str
    message: str
    severity: ErrorSeverity
    category: ErrorCategory
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    column_number: Optional[int] = None
    stack_trace: List[StackTrace] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_message": self.raw_message,
            "ide_type": self.ide_type.value,
            "error_type": self.error_type,
            "message": self.message,
            "severity": self.severity.value,
            "category": self.category.value,
            "file_path": self.file_path,
            "line_number": self.line_number,
            "column_number": self.column_number,
            "stack_trace": [
                {
                    "file_path": st.file_path,
                    "line_number": st.line_number,
                    "column_number": st.column_number,
                    "function_name": st.function_name,
                    "code_snippet": st.code_snippet
                }
                for st in self.stack_trace
            ],
            "suggestions": self.suggestions,
            "context": self.context,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class RootCause:
    """根因分析结果"""
    primary_cause: str
    secondary_causes: List[str] = field(default_factory=list)
    confidence: float = 0.0  # 0-1
    evidence: List[str] = field(default_factory=list)
    
    def __str__(self) -> str:
        causes = [self.primary_cause] + self.secondary_causes
        return f"Root Cause ({self.confidence:.0%} confidence): " + "; ".join(causes)


@dataclass
class FixSuggestion:
    """修复建议"""
    description: str
    code_changes: List[Dict[str, Any]]  # [{"file": str, "line_start": int, "line_end": int, "replacement": str}]
    confidence: float  # 0-1
    requires_confirmation: bool = True
    explanation: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "description": self.description,
            "code_changes": self.code_changes,
            "confidence": self.confidence,
            "requires_confirmation": self.requires_confirmation,
            "explanation": self.explanation
        }


@dataclass
class FixResult:
    """修复结果"""
    success: bool
    original_error: IDEParsedError
    applied_fix: Optional[FixSuggestion] = None
    error_after_fix: Optional[str] = None
    backup_path: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "original_error": self.original_error.to_dict(),
            "applied_fix": self.applied_fix.to_dict() if self.applied_fix else None,
            "error_after_fix": self.error_after_fix,
            "backup_path": self.backup_path,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class ErrorPattern:
    """错误模式定义"""
    pattern_id: str
    category: ErrorCategory
    regex_pattern: str
    severity: ErrorSeverity
    extractor: Callable[[Any], Dict[str, Any]]
    fix_template: Optional[str] = None
