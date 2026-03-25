"""
IDE Error Self-Correction System
修复生成器 - 生成错误修复方案
"""

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from .models import IDEParsedError, FixSuggestion, FixResult, ErrorCategory, RootCause


class FixTemplate:
    """修复模板"""
    
    def __init__(self, name: str, applies_to: List[ErrorCategory], 
                 pattern: str, fix_generator: callable):
        self.name = name
        self.applies_to = applies_to
        self.pattern = re.compile(pattern, re.IGNORECASE)
        self.fix_generator = fix_generator
    
    def applies(self, error: IDEParsedError) -> bool:
        """检查模板是否适用于此错误"""
        if error.category not in self.applies_to:
            return False
        return bool(self.pattern.search(error.message))
    
    def generate(self, error: IDEParsedError, context: Dict[str, Any]) -> Optional[FixSuggestion]:
        """生成修复建议"""
        return self.fix_generator(error, context)


class FixGenerator:
    """修复生成器"""
    
    def __init__(self):
        self.templates: List[FixTemplate] = []
        self._init_templates()
    
    def _init_templates(self):
        """初始化修复模板"""
        # Python 语法错误模板
        self.templates.append(FixTemplate(
            name="missing_colon",
            applies_to=[ErrorCategory.SYNTAX],
            pattern=r"expected ':'",
            fix_generator=self._fix_missing_colon
        ))
        
        self.templates.append(FixTemplate(
            name="unclosed_string",
            applies_to=[ErrorCategory.SYNTAX],
            pattern=r"eol while scanning string literal",
            fix_generator=self._fix_unclosed_string
        ))
        
        # 导入错误模板
        self.templates.append(FixTemplate(
            name="missing_import",
            applies_to=[ErrorCategory.IMPORT],
            pattern=r"no module named",
            fix_generator=self._fix_missing_import
        ))
        
        self.templates.append(FixTemplate(
            name="import_name_error",
            applies_to=[ErrorCategory.IMPORT],
            pattern=r"cannot import name",
            fix_generator=self._fix_import_name
        ))
        
        # 类型错误模板
        self.templates.append(FixTemplate(
            name="none_type_error",
            applies_to=[ErrorCategory.TYPE, ErrorCategory.RUNTIME],
            pattern=r"'NoneType'",
            fix_generator=self._fix_none_type_error
        ))
        
        self.templates.append(FixTemplate(
            name="str_not_callable",
            applies_to=[ErrorCategory.TYPE],
            pattern=r"'str' object is not callable",
            fix_generator=self._fix_str_not_callable
        ))
        
        # 运行时错误模板
        self.templates.append(FixTemplate(
            name="index_out_of_range",
            applies_to=[ErrorCategory.RUNTIME],
            pattern=r"index out of range|list index out of range",
            fix_generator=self._fix_index_out_of_range
        ))
        
        self.templates.append(FixTemplate(
            name="key_error",
            applies_to=[ErrorCategory.RUNTIME],
            pattern=r"keyerror",
            fix_generator=self._fix_key_error
        ))
        
        # 依赖错误模板
        self.templates.append(FixTemplate(
            name="missing_dependency",
            applies_to=[ErrorCategory.DEPENDENCY],
            pattern=r"could not find|cannot resolve|not found",
            fix_generator=self._fix_missing_dependency
        ))
    
    def generate_fix(self, error: IDEParsedError, root_cause: Optional[RootCause] = None) -> List[FixSuggestion]:
        """
        为错误生成修复建议
        
        Args:
            error: 解析后的错误
            root_cause: 根因分析结果（可选）
            
        Returns:
            修复建议列表
        """
        suggestions = []
        context = {"root_cause": root_cause}
        
        # 1. 尝试匹配模板
        for template in self.templates:
            if template.applies(error):
                suggestion = template.generate(error, context)
                if suggestion:
                    suggestions.append(suggestion)
        
        # 2. 基于根因的修复
        if root_cause and not suggestions:
            suggestion = self._generate_from_root_cause(error, root_cause)
            if suggestion:
                suggestions.append(suggestion)
        
        # 3. 通用修复建议
        if not suggestions:
            suggestion = self._generate_generic_fix(error)
            if suggestion:
                suggestions.append(suggestion)
        
        # 按可信度排序
        suggestions.sort(key=lambda x: x.confidence, reverse=True)
        
        return suggestions
    
    def generate_batch(self, errors: List[IDEParsedError],
                       root_causes: Optional[List[RootCause]] = None) -> List[Tuple[IDEParsedError, List[FixSuggestion]]]:
        """批量生成修复建议"""
        results = []
        for i, error in enumerate(errors):
            root_cause = root_causes[i] if root_causes and i < len(root_causes) else None
            suggestions = self.generate_fix(error, root_cause)
            results.append((error, suggestions))
        return results
    
    # ===== 具体修复模板实现 =====
    
    def _fix_missing_colon(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复缺少冒号的错误"""
        return FixSuggestion(
            description="在控制语句末尾添加冒号",
            code_changes=[{
                "file": error.file_path,
                "line_start": error.line_number,
                "line_end": error.line_number,
                "replacement": self._add_colon_at_end(error.context.get("code_line", ""))
            }],
            confidence=0.9,
            requires_confirmation=True,
            explanation="Python 的 if/for/while/def/class 语句末尾需要冒号 (:)"
        )
    
    def _fix_unclosed_string(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复未关闭的字符串"""
        return FixSuggestion(
            description="关闭字符串字面量",
            code_changes=[{
                "file": error.file_path,
                "line_start": error.line_number,
                "line_end": error.line_number,
                "replacement": self._close_string(error.context.get("code_line", ""))
            }],
            confidence=0.85,
            requires_confirmation=True,
            explanation="字符串字面量未正确关闭，需要添加匹配的引号"
        )
    
    def _fix_missing_import(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复缺少的导入"""
        # 从错误消息中提取模块名
        match = re.search(r"no module named ['\"](\w+)['\"]", error.message, re.IGNORECASE)
        if match:
            module_name = match.group(1)
            return FixSuggestion(
                description=f"安装缺失的模块: {module_name}",
                code_changes=[{
                    "file": "TERMINAL_COMMAND",
                    "command": f"pip install {module_name}",
                    "description": f"运行命令安装 {module_name} 模块"
                }],
                confidence=0.8,
                requires_confirmation=True,
                explanation=f"模块 '{module_name}' 未安装，需要安装后才能导入"
            )
        
        return FixSuggestion(
            description="检查导入语句和模块安装",
            code_changes=[],
            confidence=0.6,
            requires_confirmation=True,
            explanation="无法自动确定缺失的模块，请手动检查"
        )
    
    def _fix_import_name(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复导入名称错误"""
        match = re.search(r"cannot import name ['\"](\w+)['\"]", error.message, re.IGNORECASE)
        if match:
            name = match.group(1)
            return FixSuggestion(
                description=f"检查 '{name}' 的导出或导入路径",
                code_changes=[],
                confidence=0.7,
                requires_confirmation=True,
                explanation=f"'{name}' 可能不存在于导入的模块中，或者导出方式不正确"
            )
        return None
    
    def _fix_none_type_error(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复 NoneType 错误"""
        return FixSuggestion(
            description="添加空值检查",
            code_changes=[{
                "file": error.file_path,
                "line_start": error.line_number,
                "line_end": error.line_number,
                "replacement": self._add_none_check(error.context.get("code_line", ""))
            }],
            confidence=0.75,
            requires_confirmation=True,
            explanation="变量为 None，需要添加空值检查"
        )
    
    def _fix_str_not_callable(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复字符串被当作函数调用的错误"""
        return FixSuggestion(
            description="检查变量名是否与函数名冲突",
            code_changes=[],
            confidence=0.7,
            requires_confirmation=True,
            explanation="变量名可能覆盖了内置函数或之前的函数定义"
        )
    
    def _fix_index_out_of_range(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复索引越界错误"""
        return FixSuggestion(
            description="添加索引边界检查",
            code_changes=[{
                "file": error.file_path,
                "line_start": error.line_number,
                "line_end": error.line_number,
                "replacement": self._add_index_check(error.context.get("code_line", ""))
            }],
            confidence=0.8,
            requires_confirmation=True,
            explanation="索引超出列表/数组范围，需要添加边界检查"
        )
    
    def _fix_key_error(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复 KeyError"""
        return FixSuggestion(
            description="使用 .get() 方法或添加键存在性检查",
            code_changes=[{
                "file": error.file_path,
                "line_start": error.line_number,
                "line_end": error.line_number,
                "replacement": self._use_dict_get(error.context.get("code_line", ""))
            }],
            confidence=0.85,
            requires_confirmation=True,
            explanation="字典键可能不存在，建议使用 .get() 方法或先检查键是否存在"
        )
    
    def _fix_missing_dependency(self, error: IDEParsedError, context: Dict[str, Any]) -> FixSuggestion:
        """修复缺少的依赖"""
        return FixSuggestion(
            description="安装或更新依赖包",
            code_changes=[],
            confidence=0.7,
            requires_confirmation=True,
            explanation="依赖包未正确安装或版本不匹配，请检查 requirements.txt 或 package.json"
        )
    
    def _generate_from_root_cause(self, error: IDEParsedError, root_cause: RootCause) -> Optional[FixSuggestion]:
        """基于根因生成修复"""
        return FixSuggestion(
            description=f"修复根因: {root_cause.primary_cause}",
            code_changes=[],
            confidence=root_cause.confidence * 0.8,
            requires_confirmation=True,
            explanation=f"基于分析的主要根因: {root_cause.primary_cause}"
        )
    
    def _generate_generic_fix(self, error: IDEParsedError) -> Optional[FixSuggestion]:
        """生成通用修复建议"""
        return FixSuggestion(
            description=f"查看并修复 {error.error_type}",
            code_changes=[],
            confidence=0.5,
            requires_confirmation=True,
            explanation=f"错误类型: {error.error_type}，消息: {error.message}"
        )
    
    # ===== 辅助方法 =====
    
    def _add_colon_at_end(self, line: str) -> str:
        """在行末添加冒号"""
        if line and not line.rstrip().endswith(':'):
            return line.rstrip() + ':'
        return line
    
    def _close_string(self, line: str) -> str:
        """关闭字符串"""
        # 简单实现：根据引号类型添加匹配的引号
        if '"' in line and line.count('"') % 2 == 1:
            return line + '"'
        if "'" in line and line.count("'") % 2 == 1:
            return line + "'"
        return line
    
    def _add_none_check(self, line: str) -> str:
        """添加空值检查"""
        # 简化实现
        stripped = line.strip()
        if '=' in stripped:
            var = stripped.split('=')[0].strip()
            return f"if {var} is not None:\n    {line}"
        return f"# TODO: 添加空值检查\n{line}"
    
    def _add_index_check(self, line: str) -> str:
        """添加索引检查"""
        return f"# TODO: 添加索引边界检查\n{line}"
    
    def _use_dict_get(self, line: str) -> str:
        """使用 dict.get() 替代直接访问"""
        # 简单的正则替换
        pattern = r'(\w+)\[(\'[^\']*\'|"[^"]*"|\w+)\]'
        replacement = r'\1.get(\2)'
        return re.sub(pattern, replacement, line)


class FixApplier:
    """修复应用器"""
    
    def __init__(self, backup_dir: str = ".ide_fix_backups"):
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(exist_ok=True)
    
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
        if fix.requires_confirmation and not confirm:
            return FixResult(
                success=False,
                original_error=error,
                applied_fix=fix,
                error_after_fix="Fix requires confirmation but was not confirmed"
            )
        
        backup_path = None
        
        try:
            for change in fix.code_changes:
                if change.get("file") == "TERMINAL_COMMAND":
                    # 终端命令
                    continue
                
                file_path = change.get("file")
                if not file_path or not Path(file_path).exists():
                    continue
                
                # 创建备份
                if backup_path is None:
                    backup_path = self._create_backup(file_path)
                
                # 应用修改
                self._apply_code_change(file_path, change)
            
            return FixResult(
                success=True,
                original_error=error,
                applied_fix=fix,
                backup_path=str(backup_path) if backup_path else None
            )
            
        except Exception as e:
            # 恢复备份
            if backup_path:
                self._restore_backup(backup_path, error.file_path)
            
            return FixResult(
                success=False,
                original_error=error,
                applied_fix=fix,
                error_after_fix=str(e)
            )
    
    def _create_backup(self, file_path: str) -> Path:
        """创建文件备份"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{Path(file_path).stem}_{timestamp}{Path(file_path).suffix}"
        backup_path = self.backup_dir / backup_name
        shutil.copy2(file_path, backup_path)
        return backup_path
    
    def _apply_code_change(self, file_path: str, change: Dict[str, Any]):
        """应用代码修改"""
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        line_start = change.get("line_start", 1) - 1  # 转换为0索引
        line_end = change.get("line_end", line_start + 1) - 1
        replacement = change.get("replacement", "")
        
        new_lines = lines[:line_start]
        new_lines.append(replacement + '\n')
        new_lines.extend(lines[line_end + 1:])
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    
    def _restore_backup(self, backup_path: Path, original_path: str):
        """恢复备份"""
        if backup_path.exists() and original_path:
            shutil.copy2(backup_path, original_path)
    
    def list_backups(self) -> List[Path]:
        """列出所有备份"""
        return list(self.backup_dir.glob("*"))
    
    def cleanup_old_backups(self, days: int = 7):
        """清理旧备份"""
        from datetime import timedelta
        cutoff = datetime.now() - timedelta(days=days)
        
        for backup in self.backup_dir.glob("*"):
            if datetime.fromtimestamp(backup.stat().st_mtime) < cutoff:
                backup.unlink()
