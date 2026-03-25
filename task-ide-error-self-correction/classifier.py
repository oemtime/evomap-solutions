"""
IDE Error Self-Correction System
错误分类器 - 对错误进行分类和根因分析
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from .models import IDEParsedError, ErrorCategory, RootCause, ErrorSeverity


class ErrorClassifier:
    """错误分类器"""
    
    # 错误类型关键词映射
    CATEGORY_KEYWORDS = {
        ErrorCategory.SYNTAX: [
            "syntax", "syntaxerror", "unexpected token", "invalid syntax",
            "expected", "missing", "unexpected", "unterminated"
        ],
        ErrorCategory.TYPE: [
            "type", "typeerror", "type mismatch", "cannot assign",
            "argument of type", "is not callable", "has no attribute"
        ],
        ErrorCategory.IMPORT: [
            "import", "importerror", "modulenotfound", "cannot import",
            "no module named", "package not found"
        ],
        ErrorCategory.RUNTIME: [
            "runtime", "runtimeerror", "exception", "nullpointer",
            "indexerror", "keyerror", "attributeerror", "valueerror"
        ],
        ErrorCategory.CONFIG: [
            "config", "configuration", "settings", "property",
            "invalid configuration", "missing configuration"
        ],
        ErrorCategory.DEPENDENCY: [
            "dependency", "dependencies", "npm", "pip", "maven",
            "gradle", "yarn", "pnpm", "requirements"
        ],
        ErrorCategory.LINTING: [
            "lint", "eslint", "pylint", "flake8", "mypy", "tslint",
            "style", "format", "convention", "pep8"
        ],
        ErrorCategory.COMPILATION: [
            "compile", "compilation", "compiler", "javac", "gcc",
            "clang", "build failed", "cannot resolve"
        ]
    }
    
    def __init__(self):
        self._category_patterns = self._compile_patterns()
    
    def _compile_patterns(self) -> Dict[ErrorCategory, List[re.Pattern]]:
        """编译分类关键词为正则表达式"""
        patterns = {}
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            patterns[category] = [
                re.compile(rf'\b{re.escape(keyword)}\b', re.IGNORECASE)
                for keyword in keywords
            ]
        return patterns
    
    def classify(self, error: IDEParsedError) -> ErrorCategory:
        """
        对错误进行分类
        
        Args:
            error: 解析后的错误
            
        Returns:
            错误分类
        """
        # 如果已经有分类，直接使用
        if error.category != ErrorCategory.UNKNOWN:
            return error.category
        
        # 基于错误消息进行分类
        text_to_check = f"{error.error_type} {error.message} {error.raw_message}".lower()
        
        scores = {}
        for category, patterns in self._category_patterns.items():
            score = sum(1 for pattern in patterns if pattern.search(text_to_check))
            if score > 0:
                scores[category] = score
        
        if scores:
            # 返回得分最高的分类
            return max(scores.items(), key=lambda x: x[1])[0]
        
        return ErrorCategory.UNKNOWN
    
    def classify_batch(self, errors: List[IDEParsedError]) -> List[Tuple[IDEParsedError, ErrorCategory]]:
        """批量分类"""
        return [(error, self.classify(error)) for error in errors]
    
    def get_error_statistics(self, errors: List[IDEParsedError]) -> Dict[str, Any]:
        """获取错误统计信息"""
        categories = {}
        severities = {}
        file_errors = {}
        
        for error in errors:
            # 分类统计
            cat = error.category.value
            categories[cat] = categories.get(cat, 0) + 1
            
            # 严重程度统计
            sev = error.severity.value
            severities[sev] = severities.get(sev, 0) + 1
            
            # 文件统计
            if error.file_path:
                file_errors[error.file_path] = file_errors.get(error.file_path, 0) + 1
        
        return {
            "total_errors": len(errors),
            "by_category": categories,
            "by_severity": severities,
            "by_file": dict(sorted(file_errors.items(), key=lambda x: x[1], reverse=True)[:10])
        }


class RootCauseAnalyzer:
    """根因分析器"""
    
    # 常见根因模式
    ROOT_CAUSE_PATTERNS = {
        ErrorCategory.SYNTAX: {
            r"expected ':'": "Missing colon at end of control statement",
            r"expected indent": "Incorrect indentation",
            r"unexpected indent": "Extra or inconsistent indentation",
            r"eol while scanning string literal": "Unclosed string literal",
            r"unexpected eof": "Unexpected end of file - possibly missing closing bracket",
            r"unexpected token": "Unexpected token in expression"
        },
        ErrorCategory.IMPORT: {
            r"no module named '(\w+)'": "Missing package installation: {0}",
            r"cannot import name '(\w+)'": "Incorrect import statement or missing export",
            r"attempted relative import": "Incorrect relative import usage"
        },
        ErrorCategory.TYPE: {
            r"'str' object is not callable": "Variable name shadows built-in or function",
            r"'NoneType'": "Function returned None unexpectedly",
            r"cannot concatenate": "Type mismatch in string/sequence concatenation",
            r"unsupported operand type": "Operation not supported for these types"
        },
        ErrorCategory.RUNTIME: {
            r"index out of range": "Accessing list/array with invalid index",
            r"keyerror": "Dictionary key not found",
            r"attributeerror: 'nonetype'": "Accessing attribute on None value",
            r"division by zero": "Attempted division by zero"
        },
        ErrorCategory.DEPENDENCY: {
            r"version conflict": "Dependency version mismatch",
            r"peer dependency": "Missing peer dependency",
            r"could not resolve": "Unable to resolve dependency"
        }
    }
    
    def __init__(self):
        self._compiled_patterns = self._compile_root_cause_patterns()
    
    def _compile_root_cause_patterns(self) -> Dict[ErrorCategory, List[Tuple[re.Pattern, str]]]:
        """编译根因模式"""
        compiled = {}
        for category, patterns in self.ROOT_CAUSE_PATTERNS.items():
            compiled[category] = [
                (re.compile(pattern, re.IGNORECASE), explanation)
                for pattern, explanation in patterns.items()
            ]
        return compiled
    
    def analyze(self, error: IDEParsedError) -> RootCause:
        """
        分析错误根因
        
        Args:
            error: 解析后的错误
            
        Returns:
            根因分析结果
        """
        causes = []
        evidence = []
        
        # 1. 基于模式的根因分析
        pattern_causes = self._analyze_by_pattern(error)
        causes.extend(pattern_causes)
        
        # 2. 基于堆栈跟踪的分析
        if error.stack_trace:
            stack_cause = self._analyze_stack_trace(error)
            if stack_cause:
                causes.append(stack_cause)
                evidence.append(f"Stack trace points to: {error.stack_trace[0].file_path}")
        
        # 3. 基于错误位置的分析
        if error.file_path:
            file_cause = self._analyze_file_context(error)
            if file_cause:
                causes.append(file_cause)
        
        # 构建根因结果
        if causes:
            confidence = self._calculate_confidence(error, len(causes))
            return RootCause(
                primary_cause=causes[0],
                secondary_causes=causes[1:3],  # 最多3个次要原因
                confidence=confidence,
                evidence=evidence[:5]  # 最多5条证据
            )
        
        return RootCause(
            primary_cause=f"Unknown cause for {error.error_type}",
            secondary_causes=[],
            confidence=0.3,
            evidence=["Unable to determine specific root cause"]
        )
    
    def _analyze_by_pattern(self, error: IDEParsedError) -> List[str]:
        """基于模式匹配分析根因"""
        causes = []
        text_to_check = f"{error.message} {error.raw_message}".lower()
        
        patterns = self._compiled_patterns.get(error.category, [])
        for pattern, explanation in patterns:
            match = pattern.search(text_to_check)
            if match:
                # 格式化解释，使用匹配的组
                if match.groups():
                    try:
                        explanation = explanation.format(*match.groups())
                    except:
                        pass
                causes.append(explanation)
        
        return causes
    
    def _analyze_stack_trace(self, error: IDEParsedError) -> Optional[str]:
        """分析堆栈跟踪信息"""
        if not error.stack_trace:
            return None
        
        # 分析最常见的堆栈模式
        first_frame = error.stack_trace[0]
        
        # 检查是否是框架/库的错误
        if any(lib in first_frame.file_path.lower() for lib in ['site-packages', 'node_modules', '.venv']):
            return f"Issue may be in external dependency: {first_frame.file_path}"
        
        # 检查是否是测试文件
        if 'test' in first_frame.file_path.lower():
            return "Error occurring in test code"
        
        return None
    
    def _analyze_file_context(self, error: IDEParsedError) -> Optional[str]:
        """分析文件上下文"""
        if not error.file_path:
            return None
        
        # 检查文件类型相关的根因
        file_lower = error.file_path.lower()
        
        if file_lower.endswith(('test.py', 'tests.py', 'spec.js', 'test.ts')):
            return "Error in test file - check test setup or mocking"
        
        if 'config' in file_lower or 'settings' in file_lower:
            return "Configuration file issue - verify settings"
        
        if 'migration' in file_lower:
            return "Database migration error - check schema changes"
        
        return None
    
    def _calculate_confidence(self, error: IDEParsedError, cause_count: int) -> float:
        """计算根因分析的可信度"""
        confidence = 0.5
        
        # 基于分类准确性的调整
        if error.category != ErrorCategory.UNKNOWN:
            confidence += 0.2
        
        # 基于发现的原因数量
        confidence += min(cause_count * 0.1, 0.2)
        
        # 基于堆栈跟踪的完整性
        if error.stack_trace:
            confidence += 0.1
        
        return min(confidence, 0.95)
    
    def analyze_batch(self, errors: List[IDEParsedError]) -> List[Tuple[IDEParsedError, RootCause]]:
        """批量分析"""
        return [(error, self.analyze(error)) for error in errors]
    
    def find_related_errors(self, errors: List[IDEParsedError]) -> List[List[IDEParsedError]]:
        """
        查找相关错误（可能由同一根因引起）
        
        Returns:
            相关错误的分组
        """
        groups = []
        ungrouped = set(range(len(errors)))
        
        for i in range(len(errors)):
            if i not in ungrouped:
                continue
            
            group = [errors[i]]
            ungrouped.remove(i)
            
            for j in list(ungrouped):
                if self._errors_are_related(errors[i], errors[j]):
                    group.append(errors[j])
                    ungrouped.remove(j)
            
            if len(group) > 1:
                groups.append(group)
        
        return groups
    
    def _errors_are_related(self, error1: IDEParsedError, error2: IDEParsedError) -> bool:
        """判断两个错误是否相关"""
        # 同一文件且行号接近
        if (error1.file_path and error2.file_path and 
            error1.file_path == error2.file_path):
            line_diff = abs((error1.line_number or 0) - (error2.line_number or 0))
            if line_diff < 5:  # 5行以内
                return True
        
        # 相同错误类型
        if error1.error_type == error2.error_type:
            return True
        
        # 相同错误分类
        if error1.category == error2.category:
            # 检查消息相似度
            similarity = self._calculate_similarity(error1.message, error2.message)
            if similarity > 0.7:
                return True
        
        return False
    
    def _calculate_similarity(self, str1: str, str2: str) -> float:
        """计算两个字符串的相似度（简单版本）"""
        if not str1 or not str2:
            return 0.0
        
        # 使用集合的Jaccard相似度
        set1 = set(str1.lower().split())
        set2 = set(str2.lower().split())
        
        intersection = len(set1 & set2)
        union = len(set1 | set2)
        
        return intersection / union if union > 0 else 0.0
