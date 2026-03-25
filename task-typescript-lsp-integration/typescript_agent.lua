-- Neovim Lua 插件示例 - TypeScript Agent 集成
-- 使用方法: 将此文件放入 ~/.config/nvim/lua/typescript_agent.lua

local M = {}

-- 默认配置
M.config = {
  enabled = true,
  server_path = 'typescript-language-server',
  auto_start = true,
  features = {
    type_inference = true,
    error_detection = true,
    code_completion = true,
    refactoring = true,
    auto_fix = true,
  },
  -- 日志回调
  on_log = function(message, level)
    vim.notify('[TS Agent] ' .. message, level == 'error' and vim.log.levels.ERROR or vim.log.levels.INFO)
  end
}

-- Agent 实例
local agent = nil

-- 检查依赖
local has_agent, TypeScriptAgent = pcall(require, 'typescript_agent_lsp')
if not has_agent then
  vim.notify('TypeScript Agent not available. Install typescript-agent-lsp', vim.log.levels.WARN)
  return M
end

-- 启动 Agent
function M.start()
  if agent then
    vim.notify('TypeScript Agent already running', vim.log.levels.INFO)
    return
  end

  local workspace_root = vim.fn.getcwd()
  
  local config = {
    lsp = {
      serverPath = M.config.server_path,
      rootPath = workspace_root,
      onLog = M.config.on_log,
    },
    features = {
      typeInference = M.config.features.type_inference,
      errorDetection = M.config.features.error_detection,
      codeCompletion = M.config.features.code_completion,
      refactoring = M.config.features.refactoring,
      autoFix = M.config.features.auto_fix,
    },
    editor = 'neovim',
  }

  agent = TypeScriptAgent.TypeScriptAgent(config)
  
  agent:on('ready', function()
    vim.notify('TypeScript Agent is ready', vim.log.levels.INFO)
  end)
  
  agent:on('error', function(err)
    vim.notify('TypeScript Agent error: ' .. tostring(err), vim.log.levels.ERROR)
  end)
  
  agent:start()
end

-- 停止 Agent
function M.stop()
  if not agent then
    vim.notify('TypeScript Agent not running', vim.log.levels.WARN)
    return
  end
  
  agent:stop()
  agent = nil
  vim.notify('TypeScript Agent stopped', vim.log.levels.INFO)
end

-- 显示类型
function M.show_type()
  if not agent then
    vim.notify('TypeScript Agent not running', vim.log.levels.WARN)
    return
  end

  local buf = vim.api.nvim_get_current_buf()
  local file_path = vim.api.nvim_buf_get_name(buf)
  local pos = vim.api.nvim_win_get_cursor(0)
  local row, col = pos[1] - 1, pos[2]

  local type_info = agent:getTypeAtPosition(file_path, row, col)
  
  if type_info then
    local message = type_info.name 
      and string.format('%s: %s', type_info.name, type_info.type)
      or type_info.type
    vim.notify(message, vim.log.levels.INFO)
  else
    vim.notify('No type information available', vim.log.levels.WARN)
  end
end

-- 显示错误
function M.show_errors()
  if not agent then
    vim.notify('TypeScript Agent not running', vim.log.levels.WARN)
    return
  end

  local buf = vim.api.nvim_get_current_buf()
  local file_path = vim.api.nvim_buf_get_name(buf)

  local errors = agent:getErrors(file_path)
  
  if #errors == 0 then
    vim.notify('No errors found!', vim.log.levels.INFO)
    return
  end

  -- 创建 quickfix 列表
  local qflist = {}
  for _, error in ipairs(errors) do
    table.insert(qflist, {
      filename = file_path,
      lnum = error.range.start.line + 1,
      col = error.range.start.character + 1,
      text = string.format('[%s] %s', error.severity:upper(), error.message),
      type = error.severity:sub(1, 1):upper(),
    })
  end

  vim.fn.setqflist(qflist)
  vim.cmd('copen')
  vim.notify(string.format('Found %d error(s)', #errors), vim.log.levels.INFO)
end

-- 修复所有错误
function M.fix_all()
  if not agent then
    vim.notify('TypeScript Agent not running', vim.log.levels.WARN)
    return
  end

  local buf = vim.api.nvim_get_current_buf()
  local file_path = vim.api.nvim_buf_get_name(buf)

  local result = agent:fixAll(file_path)
  vim.notify(
    string.format('Fixed %d error(s), %d failed', result.applied, result.failed),
    vim.log.levels.INFO
  )
  
  -- 刷新缓冲区
  vim.cmd('edit')
end

-- 跳转到定义
function M.goto_definition()
  if not agent then
    vim.notify('TypeScript Agent not running', vim.log.levels.WARN)
    return
  end

  local buf = vim.api.nvim_get_current_buf()
  local file_path = vim.api.nvim_buf_get_name(buf)
  local pos = vim.api.nvim_win_get_cursor(0)
  local row, col = pos[1] - 1, pos[2]

  local locations = agent:gotoDefinition(file_path, row, col)
  
  if locations and #locations > 0 then
    local loc = locations[1]
    local target_path = loc.uri:gsub('file://', '')
    vim.cmd('edit ' .. target_path)
    vim.api.nvim_win_set_cursor(0, {
      loc.range.start.line + 1,
      loc.range.start.character,
    })
  else
    vim.notify('No definition found', vim.log.levels.WARN)
  end
end

-- 重命名符号
function M.rename_symbol()
  if not agent then
    vim.notify('TypeScript Agent not running', vim.log.levels.WARN)
    return
  end

  local buf = vim.api.nvim_get_current_buf()
  local file_path = vim.api.nvim_buf_get_name(buf)
  local pos = vim.api.nvim_win_get_cursor(0)
  local row, col = pos[1] - 1, pos[2]

  vim.ui.input({ prompt = 'New name: ' }, function(new_name)
    if not new_name or new_name == '' then
      return
    end

    local edit = agent:renameSymbol(file_path, row, col, new_name)
    
    if edit then
      -- 应用编辑
      apply_workspace_edit(edit)
      vim.notify('Renamed to ' .. new_name, vim.log.levels.INFO)
    end
  end)
end

-- 应用工作区编辑
local function apply_workspace_edit(edit)
  if not edit or not edit.changes then
    return
  end

  for uri, changes in pairs(edit.changes) do
    local path = uri:gsub('file://', '')
    local bufnr = vim.fn.bufadd(path)
    vim.fn.bufload(bufnr)

    -- 按行分组变更
    local line_changes = {}
    for _, change in ipairs(changes) do
      local line = change.range.start.line
      if not line_changes[line] then
        line_changes[line] = {}
      end
      table.insert(line_changes[line], change)
    end

    -- 应用变更（从后往前）
    for line, line_change_list in pairs(line_changes) do
      table.sort(line_change_list, function(a, b)
        return a.range.start.character > b.range.start.character
      end)

      for _, change in ipairs(line_change_list) do
        local start_line = change.range.start.line
        local start_col = change.range.start.character
        local end_line = change.range.end.line
        local end_col = change.range.end.character

        vim.api.nvim_buf_set_text(
          bufnr,
          start_line,
          start_col,
          end_line,
          end_col,
          vim.split(change.newText, '\n')
        )
      end
    end
  end
end

-- 文档打开处理
local function on_document_open(args)
  if not agent then return end
  
  local buf = args.buf
  local file_path = vim.api.nvim_buf_get_name(buf)
  local content = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), '\n')
  
  local ft = vim.api.nvim_buf_get_option(buf, 'filetype')
  if ft == 'typescript' or ft == 'typescriptreact' then
    agent:openDocument(file_path, content, ft)
  end
end

-- 文档变更处理
local function on_document_change(args)
  if not agent then return end
  
  local buf = args.buf
  local file_path = vim.api.nvim_buf_get_name(buf)
  local content = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), '\n')
  
  agent:updateDocument(file_path, content)
end

-- 文档关闭处理
local function on_document_close(args)
  if not agent then return end
  
  local buf = args.buf
  local file_path = vim.api.nvim_buf_get_name(buf)
  
  agent:closeDocument(file_path)
end

-- 设置自动命令
function M.setup_autocmds()
  local group = vim.api.nvim_create_augroup('TypeScriptAgent', { clear = true })
  
  vim.api.nvim_create_autocmd('FileType', {
    group = group,
    pattern = { 'typescript', 'typescriptreact' },
    callback = on_document_open,
  })
  
  vim.api.nvim_create_autocmd({ 'TextChanged', 'TextChangedI' }, {
    group = group,
    pattern = { '*.ts', '*.tsx' },
    callback = on_document_change,
  })
  
  vim.api.nvim_create_autocmd('BufDelete', {
    group = group,
    pattern = { '*.ts', '*.tsx' },
    callback = on_document_close,
  })
  
  vim.api.nvim_create_autocmd('VimLeavePre', {
    group = group,
    callback = function()
      if agent then
        agent:stop()
      end
    end,
  })
end

-- 设置键映射
function M.setup_keymaps()
  local opts = { noremap = true, silent = true }
  
  vim.keymap.set('n', '<Leader>ts', M.start, opts)
  vim.keymap.set('n', '<Leader>tx', M.stop, opts)
  vim.keymap.set('n', '<Leader>tt', M.show_type, opts)
  vim.keymap.set('n', '<Leader>te', M.show_errors, opts)
  vim.keymap.set('n', '<Leader>tf', M.fix_all, opts)
  vim.keymap.set('n', '<Leader>td', M.goto_definition, opts)
  vim.keymap.set('n', '<Leader>tr', M.rename_symbol, opts)
end

-- 初始化
function M.setup(user_config)
  M.config = vim.tbl_deep_extend('force', M.config, user_config or {})
  
  if M.config.enabled then
    M.setup_autocmds()
    M.setup_keymaps()
    
    if M.config.auto_start then
      M.start()
    end
  end
end

return M
