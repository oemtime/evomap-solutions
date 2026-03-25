"""
IDE Error Self-Correction System
测试用例
"""

import unittest
from ide_error_self_correction import (
    QuickFixer,
    IDESelfCorrectionSystem,
    IDEType,
    ErrorCategory,
    ErrorSeverity
)


class TestLogParser(unittest.TestCase):
    """测试日志解析器"""
    
    def test_parse_python_syntax_error(self):
        log = '''
File "test.py", line 5
    def hello()
              ^
SyntaxError: expected ':'
'''
        errors = QuickFixer.parse(log)
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0].category, ErrorCategory.SYNTAX)
        self.assertEqual(errors[0].error_type, "SyntaxError")
    
    def test_parse_python_import_error(self):
        log = '''
Traceback (most recent call last):
  File "main.py", line 1, in <module>
    import nonexistent_module
ModuleNotFoundError: No module named 'nonexistent_module'
'''
        errors = QuickFixer.parse(log)
        self.assertTrue(len(errors) >= 1)
        # 检查至少有一个导入错误
        import_errors = [e for e in errors if e.category == ErrorCategory.IMPORT]
        self.assertTrue(len(import_errors) >= 1)
    
    def test_parse_typescript_error(self):
        log = '''
src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.
'''
        errors = QuickFixer.parse(log)
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0].category, ErrorCategory.SYNTAX)
    
    def test_auto_detect_ide_vscode(self):
        log = '''
File "app.py", line 42
    if x == 5
             ^
SyntaxError: invalid syntax
'''
        system = IDESelfCorrectionSystem()
        ide_type, errors = system.parse_log(log)
        self.assertEqual(ide_type, IDEType.VSCODE)
    
    def test_auto_detect_ide_intellij(self):
        log = '''
Main.java:25: error: cannot find symbol
        System.out.println(unknownVar);
                          ^
  symbol:   variable unknownVar
  location: class Main
'''
        system = IDESelfCorrectionSystem()
        ide_type, errors = system.parse_log(log)
        self.assertEqual(ide_type, IDEType.INTELLIJ)


class TestErrorClassifier(unittest.TestCase):
    """测试错误分类器"""
    
    def test_classify_syntax_error(self):
        log = '''
File "test.py", line 3
    print "hello"
          ^
SyntaxError: invalid syntax
'''
        result = QuickFixer.analyze(log)
        self.assertIn("errors_by_category", result)
        self.assertIn("syntax", result["errors_by_category"])
    
    def test_classify_import_error(self):
        log = '''
ModuleNotFoundError: No module named 'requests'
'''
        errors = QuickFixer.parse(log)
        system = IDESelfCorrectionSystem()
        classified = system.classify_errors(errors)
        
        for error, category in classified:
            self.assertEqual(category, ErrorCategory.IMPORT)


class TestRootCauseAnalyzer(unittest.TestCase):
    """测试根因分析器"""
    
    def test_analyze_missing_colon(self):
        log = '''
File "test.py", line 2
    def hello()
              ^
SyntaxError: expected ':'
'''
        system = IDESelfCorrectionSystem()
        _, errors = system.parse_log(log)
        root_causes = system.analyze_root_causes(errors)
        
        self.assertEqual(len(root_causes), 1)
        error, cause = root_causes[0]
        self.assertGreater(cause.confidence, 0.5)
        self.assertIn("colon", cause.primary_cause.lower())
    
    def test_analyze_missing_import(self):
        log = '''
ModuleNotFoundError: No module named 'numpy'
'''
        system = IDESelfCorrectionSystem()
        _, errors = system.parse_log(log)
        root_causes = system.analyze_root_causes(errors)
        
        self.assertEqual(len(root_causes), 1)
        error, cause = root_causes[0]
        self.assertGreater(cause.confidence, 0.5)


class TestFixGenerator(unittest.TestCase):
    """测试修复生成器"""
    
    def test_generate_fix_for_syntax_error(self):
        log = '''
File "test.py", line 2
    if x == 5
             ^
SyntaxError: expected ':'
'''
        system = IDESelfCorrectionSystem()
        _, errors = system.parse_log(log)
        root_causes = system.analyze_root_causes(errors)
        fixes = system.generate_fixes(errors, [rc for _, rc in root_causes])
        
        self.assertEqual(len(fixes), 1)
        error, suggestions = fixes[0]
        self.assertGreater(len(suggestions), 0)
        self.assertIn("colon", suggestions[0].description.lower())
    
    def test_generate_fix_for_key_error(self):
        log = '''
KeyError: 'username'
'''
        system = IDESelfCorrectionSystem()
        _, errors = system.parse_log(log)
        root_causes = system.analyze_root_causes(errors)
        fixes = system.generate_fixes(errors, [rc for _, rc in root_causes])
        
        self.assertEqual(len(fixes), 1)
        error, suggestions = fixes[0]
        self.assertGreater(len(suggestions), 0)


class TestFullPipeline(unittest.TestCase):
    """测试完整流程"""
    
    def test_process_log_comprehensive(self):
        log = '''
File "main.py", line 10
    def calculate_sum(a, b)
                          ^
SyntaxError: expected ':'

File "main.py", line 15
    result = data['key']
KeyError: 'key'
'''
        system = IDESelfCorrectionSystem()
        result = system.process_log(log)
        
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["total_errors"], 2)
        self.assertIn("errors_by_category", result)
        self.assertEqual(len(result["results"]), 2)
        
        # 检查每个错误都有根因分析和修复建议
        for item in result["results"]:
            self.assertIn("root_cause", item)
            self.assertIn("suggestions", item)
            self.assertGreater(len(item["suggestions"]), 0)
    
    def test_empty_log(self):
        log = ""
        result = QuickFixer.analyze(log)
        self.assertEqual(result["status"], "no_errors_found")
    
    def test_log_with_no_errors(self):
        log = "Build successful. All tests passed."
        result = QuickFixer.analyze(log)
        self.assertEqual(result["status"], "no_errors_found")


class TestStatistics(unittest.TestCase):
    """测试统计功能"""
    
    def test_statistics_tracking(self):
        system = IDESelfCorrectionSystem()
        
        # 初始统计
        stats = system.get_statistics()
        self.assertEqual(stats["total_parsed"], 0)
        
        # 处理日志
        log = '''
File "test.py", line 1
    x =
       ^
SyntaxError: invalid syntax
'''
        system.process_log(log)
        
        stats = system.get_statistics()
        self.assertGreater(stats["total_parsed"], 0)
    
    def test_reset_statistics(self):
        system = IDESelfCorrectionSystem()
        
        log = '''
File "test.py", line 1
    x = 1
'''
        system.process_log(log)
        system.reset_statistics()
        
        stats = system.get_statistics()
        self.assertEqual(stats["total_parsed"], 0)


class TestEdgeCases(unittest.TestCase):
    """测试边界情况"""
    
    def test_malformed_log(self):
        log = "!!@@## Some garbled text 12345"
        result = QuickFixer.analyze(log)
        # 应该能处理，即使没有找到错误
        self.assertIn("status", result)
    
    def test_very_long_log(self):
        # 生成大量错误
        lines = []
        for i in range(100):
            lines.append(f'File "test{i}.py", line {i}')
            lines.append(f'    error here')
            lines.append(f'    ^')
            lines.append(f'SyntaxError: test error')
        log = '\n'.join(lines)
        
        result = QuickFixer.analyze(log)
        self.assertEqual(result["status"], "success")
        # 应该能找到大量错误
        self.assertGreater(result["total_errors"], 50)
    
    def test_multiline_error_message(self):
        log = '''
File "complex.py", line 10
    some_complex_function(
        arg1,
        arg2,
        arg3
    )
    ^
SyntaxError: invalid syntax
'''
        errors = QuickFixer.parse(log)
        self.assertEqual(len(errors), 1)
        self.assertIn("some_complex_function", errors[0].raw_message)


def run_tests():
    """运行所有测试"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # 添加所有测试类
    suite.addTests(loader.loadTestsFromTestCase(TestLogParser))
    suite.addTests(loader.loadTestsFromTestCase(TestErrorClassifier))
    suite.addTests(loader.loadTestsFromTestCase(TestRootCauseAnalyzer))
    suite.addTests(loader.loadTestsFromTestCase(TestFixGenerator))
    suite.addTests(loader.loadTestsFromTestCase(TestFullPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestStatistics))
    suite.addTests(loader.loadTestsFromTestCase(TestEdgeCases))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    run_tests()
