"""
IDE Error Self-Correction System
日志解析器模块 - 解析各种IDE的错误日志
"""

import re
from typing import Optional, List, Dict, Any, Tuple
from .models import (
    IDEParsedError, StackTrace, ErrorCategory, 
    ErrorSeverity, IDEType, ErrorPattern
)


class BaseLogParser:
    """日志解析器基类"""
    
    def __init__(self, ide_type: IDEType):
        self.ide_type = ide_type
        self.patterns: List[ErrorPattern] = []
        self._init_patterns()
    
    def _init_patterns(self):
        """初始化解析模式，子类应重写此方法"""
        pass
    
    def parse(self, log_text: str) -> List[IDEParsedError]:
        """
        解析日志文本
        
        Args:
            log_text: 原始日志文本
            
        Returns:
            解析后的错误列表
        """
        raise NotImplementedError("子类必须实现此方法")
    
    def can_parse(self, log_text: str) -> bool:
        """检查是否可以解析此日志"""
        raise NotImplementedError("子类必须实现此方法")


class VSCodeLogParser(BaseLogParser):
    """VSCode 错误日志解析器"""
    
    def __init__(self):
        super().__init__(IDEType.VSCODE)
    
    def _init_patterns(self):
        # Python 错误模式
        self.patterns.append(ErrorPattern(
            pattern_id="python_syntax_error",
            category=ErrorCategory.SYNTAX,
            regex_pattern=r'File "([^"]+)", line (\d+)\s*\n\s*([^\n]+)\s*\n\s*\^?\s*\n(SyntaxError):\s*(.+)',
            severity=ErrorSeverity.ERROR,
            extractor=self._extract_python_syntax_error
        ))
        
        self.patterns.append(ErrorPattern(
            pattern_id="python_import_error",
            category=ErrorCategory.IMPORT,
            regex_pattern=r'(ImportError|ModuleNotFoundError):\s*(.+)',
            severity=ErrorSeverity.ERROR,
            extractor=self._extract_import_error
        ))
        
        self.patterns.append(ErrorPattern(
            pattern_id="python_type_error",
            category=ErrorCategory.TYPE,
            regex_pattern=r'TypeError:\s*(.+)',
            severity=ErrorSeverity.ERROR,
            extractor=self._extract_type_error
        ))
        
        # JavaScript/TypeScript 错误模式
        self.patterns.append(ErrorPattern(
            pattern_id="js_syntax_error",
            category=ErrorCategory.SYNTAX,
            regex_pattern=r'(.+\.js|.+\.ts):(\d+):(\d+)\s*-\s*error\s+TS(\d+):\s*(.+)',
            severity=ErrorSeverity.ERROR,
            extractor=self._extract_js_error
        ))
        
        # ESLint 错误
        self.patterns.append(ErrorPattern(
            pattern_id="eslint_error",
            category=ErrorCategory.LINTING,
            regex_pattern=r'(.+):(\d+):(\d+)\s+(error|warning)\s+(.+)',
            severity=ErrorSeverity.ERROR,
            extractor=self._extract_eslint_error
        ))
    
    def parse(self, log_text: str) -> List[IDEParsedError]:
        errors = []
        lines = log_text.split('\n')
        matched_spans = set()
        
        for pattern in self.patterns:
            for match in re.finditer(pattern.regex_pattern, log_text, re.MULTILINE):
                span_start = match.start()
                if span_start in matched_spans:
                    continue
                
                line_start = log_text[:span_start].count('\n')
                error = self._create_error_from_match(pattern, match, lines, line_start)
                if error:
                    errors.append(error)
                    matched_spans.add(span_start)
        
        return errors
    
    def can_parse(self, log_text: str) -> bool:
        # 检查是否有VSCode特有的标记
        vscode_markers = [
            r'File ".+", line \d+',
            r'error\s+TS\d+',
            r'\[error\]',
            r'Problems \(\d+\)'
        ]
        return any(re.search(marker, log_text) for marker in vscode_markers)
    
    def _extract_python_syntax_error(self, match) -> Dict[str, Any]:
        return {
            "file_path": match.group(1),
            "line_number": int(match.group(2)),
            "code_line": match.group(3),
            "error_type": match.group(4),
            "message": match.group(5)
        }
    
    def _extract_import_error(self, match) -> Dict[str, Any]:
        return {
            "error_type": match.group(1),
            "message": match.group(2)
        }
    
    def _extract_type_error(self, match) -> Dict[str, Any]:
        return {
            "error_type": "TypeError",
            "message": match.group(1)
        }
    
    def _extract_js_error(self, match) -> Dict[str, Any]:
        return {
            "file_path": match.group(1),
            "line_number": int(match.group(2)),
            "column_number": int(match.group(3)),
            "error_code": f"TS{match.group(4)}",
            "message": match.group(5)
        }
    
    def _extract_eslint_error(self, match) -> Dict[str, Any]:
        severity = match.group(4).lower()
        return {
            "file_path": match.group(1),
            "line_number": int(match.group(2)),
            "column_number": int(match.group(3)),
            "severity": ErrorSeverity.ERROR if severity == "error" else ErrorSeverity.WARNING,
            "message": match.group(5)
        }
    
    def _create_error_from_match(self, pattern: ErrorPattern, match, lines: List[str], 
                                  line_idx: int) -> Optional[IDEParsedError]:
        """从匹配结果创建错误对象"""
        try:
            extracted = pattern.extractor(match)
            
            # 构建完整的错误信息
            error_lines = []
            j = line_idx
            while j < len(lines) and len(error_lines) < 10:
                error_lines.append(lines[j])
                if lines[j].strip() == '' and len(error_lines) > 2:
                    break
                j += 1
            
            raw_message = '\n'.join(error_lines)
            
            # 确定严重程度
            severity = extracted.get("severity", pattern.severity)
            
            # 构建堆栈跟踪
            stack_trace = []
            if "file_path" in extracted and extracted["file_path"]:
                stack_trace.append(StackTrace(
                    file_path=extracted["file_path"],
                    line_number=extracted.get("line_number", 0),
                    column_number=extracted.get("column_number"),
                    code_snippet=extracted.get("code_line")
                ))
            
            return IDEParsedError(
                raw_message=raw_message,
                ide_type=self.ide_type,
                error_type=extracted.get("error_type", "Unknown"),
                message=extracted.get("message", ""),
                severity=severity,
                category=pattern.category,
                file_path=extracted.get("file_path"),
                line_number=extracted.get("line_number"),
                column_number=extracted.get("column_number"),
                stack_trace=stack_trace,
                context=extracted
            )
        except Exception as e:
            # 解析失败时返回None
            return None


class IntelliJLogParser(BaseLogParser):
    """IntelliJ IDEA 错误日志解析器"""
    
    def __init__(self):
        super().__init__(IDEType.INTELLIJ)
    
    def _init_patterns(self):
        # Java 编译错误
        self.patterns.append(ErrorPattern(
            pattern_id="java_compile_error",
            category=ErrorCategory.COMPILATION,
            regex_pattern=r'(.+\.java):(\d+):\s*(error|warning):\s*(.+)',
            severity=ErrorSeverity.ERROR,
            extractor=self._extract_java_compile_error
        ))
        
        # Java 异常
        self.patterns.append(ErrorPattern(
            pattern_id="java_exception",
            category=ErrorCategory.RUNTIME,
            regex_pattern=r'(\w+(?:Exception|Error)):?\s*(.+)',
            severity=ErrorSeverity.ERROR,
            extractor=self._extract_java_exception
        ))
        
        # Maven/Gradle 构建错误
        self.patterns.append(ErrorPattern(
            pattern_id="build_error",
            category=ErrorCategory.DEPENDENCY,
            regex_pattern=r'BUILD FAILED|FAILURE: Build failed',
            severity=ErrorSeverity.ERROR,
            extractor=lambda m: {"error_type": "BuildFailed", "message": "Build failed"}
        ))
    
    def parse(self, log_text: str) -> List[IDEParsedError]:
        errors = []
        lines = log_text.split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            for pattern in self.patterns:
                match = re.search(pattern.regex_pattern, line, re.MULTILINE)
                if match:
                    error = self._create_error_from_match(pattern, match, lines, i)
                    if error:
                        # 尝试解析后续的堆栈跟踪
                        error.stack_trace = self._parse_stack_trace(lines, i)
                        errors.append(error)
                        break
            
            i += 1
        
        return errors
    
    def can_parse(self, log_text: str) -> bool:
        markers = [
            r'\.java:\d+:\s*(error|warning):',
            r'Exception in thread',
            r'BUILD FAILED',
            r'Compilation failed'
        ]
        return any(re.search(marker, log_text) for marker in markers)
    
    def _extract_java_compile_error(self, match) -> Dict[str, Any]:
        return {
            "file_path": match.group(1),
            "line_number": int(match.group(2)),
            "severity": ErrorSeverity.ERROR if match.group(3) == "error" else ErrorSeverity.WARNING,
            "message": match.group(4)
        }
    
    def _extract_java_exception(self, match) -> Dict[str, Any]:
        return {
            "error_type": match.group(1),
            "message": match.group(2) if len(match.groups()) > 1 else ""
        }
    
    def _parse_stack_trace(self, lines: List[str], start_idx: int) -> List[StackTrace]:
        """解析Java堆栈跟踪"""
        stack_trace = []
        i = start_idx + 1
        
        while i < len(lines):
            line = lines[i].strip()
            
            # 匹配堆栈跟踪行
            match = re.match(r'at\s+([\w.$]+)\(([\w]+\.\w+):(\d+)\)', line)
            if match:
                stack_trace.append(StackTrace(
                    file_path=match.group(2),
                    line_number=int(match.group(3)),
                    function_name=match.group(1)
                ))
            elif line.startswith('Caused by:'):
                pass  # 继续解析
            elif line and not line.startswith('at '):
                break
            
            i += 1
        
        return stack_trace
    
    def _create_error_from_match(self, pattern: ErrorPattern, match, lines: List[str],
                                  line_idx: int) -> Optional[IDEParsedError]:
        try:
            extracted = pattern.extractor(match)
            
            error_lines = []
            j = line_idx
            while j < len(lines) and len(error_lines) < 20:
                error_lines.append(lines[j])
                j += 1
            
            raw_message = '\n'.join(error_lines)
            severity = extracted.get("severity", pattern.severity)
            
            stack_trace = []
            if "file_path" in extracted:
                stack_trace.append(StackTrace(
                    file_path=extracted["file_path"],
                    line_number=extracted.get("line_number", 0)
                ))
            
            return IDEParsedError(
                raw_message=raw_message,
                ide_type=self.ide_type,
                error_type=extracted.get("error_type", pattern.pattern_id),
                message=extracted.get("message", ""),
                severity=severity,
                category=pattern.category,
                file_path=extracted.get("file_path"),
                line_number=extracted.get("line_number"),
                column_number=extracted.get("column_number"),
                stack_trace=stack_trace,
                context=extracted
            )
        except Exception:
            return None


class PyCharmLogParser(VSCodeLogParser):
    """PyCharm 错误日志解析器（继承VSCode解析器，添加PyCharm特有的模式）"""
    
    def __init__(self):
        BaseLogParser.__init__(self, IDEType.PYCHARM)
    
    def _init_patterns(self):
        super()._init_patterns()
        
        # PyCharm特有的Python错误模式
        self.patterns.append(ErrorPattern(
            pattern_id="pycharm_inspection",
            category=ErrorCategory.LINTING,
            regex_pattern=r'Inspection info:\s*(.+)',
            severity=ErrorSeverity.WARNING,
            extractor=lambda m: {"error_type": "Inspection", "message": m.group(1)}
        ))
    
    def can_parse(self, log_text: str) -> bool:
        markers = [
            r'Inspection info:',
            r'Python \d+\.\d+\.\d+',
            r'PyCharm'
        ]
        return any(re.search(marker, log_text) for marker in markers)


class LogParserFactory:
    """日志解析器工厂"""
    
    _parsers = {
        IDEType.VSCODE: VSCodeLogParser,
        IDEType.INTELLIJ: IntelliJLogParser,
        IDEType.PYCHARM: PyCharmLogParser,
    }
    
    @classmethod
    def get_parser(cls, ide_type: IDEType) -> BaseLogParser:
        """获取指定IDE类型的解析器"""
        parser_class = cls._parsers.get(ide_type)
        if parser_class:
            return parser_class()
        raise ValueError(f"不支持的IDE类型: {ide_type}")
    
    @classmethod
    def detect_ide_type(cls, log_text: str) -> IDEType:
        """自动检测IDE类型"""
        for ide_type, parser_class in cls._parsers.items():
            parser = parser_class()
            if parser.can_parse(log_text):
                return ide_type
        return IDEType.UNKNOWN
    
    @classmethod
    def auto_parse(cls, log_text: str) -> Tuple[IDEType, List[IDEParsedError]]:
        """自动检测IDE类型并解析"""
        ide_type = cls.detect_ide_type(log_text)
        
        if ide_type == IDEType.UNKNOWN:
            # 尝试所有解析器
            for parser_class in cls._parsers.values():
                parser = parser_class()
                errors = parser.parse(log_text)
                if errors:
                    return parser.ide_type, errors
            return IDEType.UNKNOWN, []
        
        parser = cls.get_parser(ide_type)
        return ide_type, parser.parse(log_text)
    
    @classmethod
    def register_parser(cls, ide_type: IDEType, parser_class: type):
        """注册新的解析器"""
        cls._parsers[ide_type] = parser_class
