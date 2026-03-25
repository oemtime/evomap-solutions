"""
IDE Error Self-Correction System
主控制器 - 协调各个模块的工作流程
"""

from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

from .models import (
    IDEParsedError, IDEType, FixResult, ErrorCategory, 
    ErrorSeverity, RootCause, FixSuggestion
)
from .parser import LogParserFactory, BaseLogParser
from .classifier import ErrorClassifier, RootCauseAnalyzer
from .fix_generator import FixGenerator, FixApplier


class IDESelfCorrectionSystem:
    """
    IDE 错误自我修正系统主类
    
    提供完整的错误日志解析、分类、根因分析和自动修复功能
    """
    
    def __init__(self, backup_dir: str = ".ide_fix_backups"):
        """
        初始化系统
        
        Args:
            backup_dir: 修复备份目录
        """
        self.classifier = ErrorClassifier()
        self.root_cause_analyzer = RootCauseAnalyzer()
        self.fix_generator = FixGenerator()
        self.fix_applier = FixApplier(backup_dir)
        
        self._stats = {
            "total_parsed": 0,
            "total_fixed": 0,
            "total_failed": 0
        }
    
    def parse_log(self, log_text: str, ide_type: Optional[IDEType] = None) -> Tuple[IDEType, List[IDEParsedError]]:
        """
        解析错误日志
        
        Args:
            log_text: 原始日志文本
            ide_type: IDE类型（自动检测如果为None）
            
        Returns:
            (检测到的IDE类型, 解析后的错误列表)
        """
        if ide_type:
            parser = LogParserFactory.get_parser(ide_type)
            errors = parser.parse(log_text)
            return ide_type, errors
        
        return LogParserFactory.auto_parse(log_text)
    
    def classify_errors(self, errors: List[IDEParsedError]) -> List[Tuple[IDEParsedError, ErrorCategory]]:
        """
        对错误进行分类
        
        Args:
            errors: 错误列表
            
        Returns:
            (错误, 分类) 的列表
        """
        return self.classifier.classify_batch(errors)
    
    def analyze_root_causes(self, errors: List[IDEParsedError]) -> List[Tuple[IDEParsedError, RootCause]]:
        """
        分析错误根因
        
        Args:
            errors: 错误列表
            
        Returns:
            (错误, 根因) 的列表
        """
        return self.root_cause_analyzer.analyze_batch(errors)
    
    def generate_fixes(self, errors: List[IDEParsedError],
                       root_causes: Optional[List[RootCause]] = None) -> List[Tuple[IDEParsedError, List[FixSuggestion]]]:
        """
        生成修复建议
        
        Args:
            errors: 错误列表
            root_causes: 根因列表（可选）
            
        Returns:
            (错误, 修复建议列表) 的列表
        """
        return self.fix_generator.generate_batch(errors, root_causes)
    
    def apply_fix(self, error: IDEParsedError, fix: FixSuggestion,
                  confirm: bool = True) -> FixResult:
        """
        应用修复
        
        Args:
            error: 原始错误
            fix: 修复建议
            confirm: 是否需要确认
            
        Returns:
            修复结果
        """
        result = self.fix_applier.apply_fix(error, fix, confirm)
        
        if result.success:
            self._stats["total_fixed"] += 1
        else:
            self._stats["total_failed"] += 1
        
        return result
    
    def process_log(self, log_text: str, 
                    ide_type: Optional[IDEType] = None,
                    auto_fix: bool = False,
                    confirm_fixes: bool = True) -> Dict[str, Any]:
        """
        完整的处理流程：解析 -> 分类 -> 分析 -> 生成修复 -> （可选）应用修复
        
        Args:
            log_text: 原始日志文本
            ide_type: IDE类型（自动检测如果为None）
            auto_fix: 是否自动应用修复
            confirm_fixes: 应用修复前是否需要确认
            
        Returns:
            完整的处理结果
        """
        # 1. 解析日志
        detected_ide, errors = self.parse_log(log_text, ide_type)
        self._stats["total_parsed"] += len(errors)
        
        if not errors:
            return {
                "status": "no_errors_found",
                "ide_type": detected_ide.value,
                "errors": [],
                "statistics": self.get_statistics()
            }
        
        # 2. 分类错误
        classified = self.classify_errors(errors)
        
        # 更新错误的分类
        for error, category in classified:
            error.category = category
        
        # 3. 分析根因
        root_causes = self.analyze_root_causes(errors)
        
        # 4. 生成修复建议
        fixes = self.generate_fixes(errors, [rc for _, rc in root_causes])
        
        # 5. （可选）应用修复
        fix_results = []
        if auto_fix:
            for error, suggestions in fixes:
                if suggestions:
                    result = self.apply_fix(error, suggestions[0], confirm_fixes)
                    fix_results.append(result)
        
        # 构建完整结果
        results = []
        for i, error in enumerate(errors):
            _, root_cause = root_causes[i]
            _, suggestions = fixes[i]
            
            result_item = {
                "error": error.to_dict(),
                "root_cause": {
                    "primary": root_cause.primary_cause,
                    "secondary": root_cause.secondary_causes,
                    "confidence": root_cause.confidence
                },
                "suggestions": [s.to_dict() for s in suggestions[:3]],  # 最多3个建议
                "can_auto_fix": any(not s.requires_confirmation for s in suggestions)
            }
            
            # 如果已应用修复，添加结果
            if fix_results:
                applied = [r for r in fix_results if r.original_error == error]
                if applied:
                    result_item["fix_result"] = applied[0].to_dict()
            
            results.append(result_item)
        
        return {
            "status": "success",
            "ide_type": detected_ide.value,
            "total_errors": len(errors),
            "errors_by_category": self.classifier.get_error_statistics(errors)["by_category"],
            "results": results,
            "statistics": self.get_statistics()
        }
    
    def get_statistics(self) -> Dict[str, Any]:
        """获取系统统计信息"""
        return {
            "total_parsed": self._stats["total_parsed"],
            "total_fixed": self._stats["total_fixed"],
            "total_failed": self._stats["total_failed"],
            "success_rate": (
                self._stats["total_fixed"] / 
                (self._stats["total_fixed"] + self._stats["total_failed"])
                if (self._stats["total_fixed"] + self._stats["total_failed"]) > 0 else 0
            )
        }
    
    def reset_statistics(self):
        """重置统计信息"""
        self._stats = {
            "total_parsed": 0,
            "total_fixed": 0,
            "total_failed": 0
        }
    
    def list_backups(self) -> List[str]:
        """列出所有备份文件"""
        return [str(p) for p in self.fix_applier.list_backups()]
    
    def cleanup_backups(self, days: int = 7):
        """清理旧备份"""
        self.fix_applier.cleanup_old_backups(days)


class QuickFixer:
    """快速修复工具类 - 提供简化的API"""
    
    _instance: Optional[IDESelfCorrectionSystem] = None
    
    @classmethod
    def get_instance(cls) -> IDESelfCorrectionSystem:
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = IDESelfCorrectionSystem()
        return cls._instance
    
    @classmethod
    def parse(cls, log_text: str) -> List[IDEParsedError]:
        """快速解析日志"""
        _, errors = cls.get_instance().parse_log(log_text)
        return errors
    
    @classmethod
    def analyze(cls, log_text: str) -> Dict[str, Any]:
        """快速分析日志"""
        return cls.get_instance().process_log(log_text)
    
    @classmethod
    def fix(cls, log_text: str, confirm: bool = True) -> List[FixResult]:
        """快速修复日志中的所有错误"""
        instance = cls.get_instance()
        _, errors = instance.parse_log(log_text)
        
        results = []
        root_causes = instance.analyze_root_causes(errors)
        fixes = instance.generate_fixes(errors, [rc for _, rc in root_causes])
        
        for error, suggestions in fixes:
            if suggestions:
                result = instance.apply_fix(error, suggestions[0], confirm)
                results.append(result)
        
        return results
