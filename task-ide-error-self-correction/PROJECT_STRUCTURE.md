# IDE Error Self-Correction System
# 项目结构

## 源代码
src/
  __init__.py           - 模块入口和公开API
  models.py             - 数据模型定义
  parser.py             - 日志解析器
  classifier.py         - 错误分类器和根因分析器
  fix_generator.py      - 修复生成器和应用器
  core.py               - 主控制器和快速修复类

## 配置文件
config/
  system_config.json    - 系统配置
  fix_templates.json    - 修复模板配置

## 测试
tests/
  test_system.py        - 系统测试用例

## 示例
examples/
  usage_examples.py     - 使用示例代码

## 文档
docs/
  architecture.md       - 架构设计文档

## 项目文件
README.md               - 项目说明
setup.py                - 安装配置
requirements.txt        - 依赖文件

## 目录说明
- .ide_fix_backups/    - 自动创建的修复备份目录
- logs/                - 日志目录
- custom_templates/    - 自定义修复模板目录
