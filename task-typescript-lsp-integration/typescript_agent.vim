" TypeScript Agent Vim Plugin
" 使用方法: 将此文件放入 ~/.vim/plugin/typescript_agent.vim

" 配置选项
if !exists('g:typescript_agent_enabled')
  let g:typescript_agent_enabled = 1
endif

if !exists('g:typescript_agent_server_path')
  let g:typescript_agent_server_path = 'typescript-language-server'
endif

if !exists('g:typescript_agent_auto_start')
  let g:typescript_agent_auto_start = 1
endif

" 检查 Python 支持
if !has('python3') && !has('python')
  echohl ErrorMsg
  echo 'TypeScript Agent requires Vim with Python support'
  echohl None
  finish
endif

" 加载 Python 模块
let s:plugin_path = expand('<sfile>:p:h')
if has('python3')
  execute 'py3file ' . s:plugin_path . '/typescript_agent.py'
else
  execute 'pyfile ' . s:plugin_path . '/typescript_agent.py'
endif

" 命令定义
command! TSAgentStart call s:TSAgentStart()
command! TSAgentStop call s:TSAgentStop()
command! TSAgentShowType call s:TSAgentShowType()
command! TSAgentShowErrors call s:TSAgentShowErrors()
command! TSAgentFixAll call s:TSAgentFixAll()
command! TSAgentGotoDef call s:TSAgentGotoDef()

" 快捷键映射
nnoremap <silent> <Leader>ts :TSAgentStart<CR>
nnoremap <silent> <Leader>tx :TSAgentStop<CR>
nnoremap <silent> <Leader>tt :TSAgentShowType<CR>
nnoremap <silent> <Leader>te :TSAgentShowErrors<CR>
nnoremap <silent> <Leader>tf :TSAgentFixAll<CR>
nnoremap <silent> <Leader>td :TSAgentGotoDef<CR>

" 函数定义
function! s:TSAgentStart()
  if has('python3')
    py3 ts_agent_start()
  else
    py ts_agent_start()
  endif
endfunction

function! s:TSAgentStop()
  if has('python3')
    py3 ts_agent_stop()
  else
    py ts_agent_stop()
  endif
endfunction

function! s:TSAgentShowType()
  if has('python3')
    py3 ts_agent_show_type()
  else
    py ts_agent_show_type()
  endif
endfunction

function! s:TSAgentShowErrors()
  if has('python3')
    py3 ts_agent_show_errors()
  else
    py ts_agent_show_errors()
  endif
endfunction

function! s:TSAgentFixAll()
  if has('python3')
    py3 ts_agent_fix_all()
  else
    py ts_agent_fix_all()
  endif
endfunction

function! s:TSAgentGotoDef()
  if has('python3')
    py3 ts_agent_goto_definition()
  else
    py ts_agent_goto_definition()
  endif
endfunction

" 补全函数
function! TSAgentComplete(findstart, base)
  if a:findstart
    " 找到补全开始位置
    let line = getline('.')
    let start = col('.') - 1
    while start > 0 && line[start - 1] =~ '\w'
      let start -= 1
    endwhile
    return start
  else
    " 获取补全列表
    if has('python3')
      py3 completions = ts_agent_complete()
      return py3eval('completions')
    else
      py completions = ts_agent_complete()
      return pyeval('completions')
    endif
  endif
endfunction

" 自动启动
if g:typescript_agent_enabled && g:typescript_agent_auto_start
  augroup TypeScriptAgent
    autocmd!
    autocmd FileType typescript,typescriptreact call s:TSAgentStart()
    autocmd VimLeavePre * call s:TSAgentStop()
  augroup END
endif

" 设置补全
if g:typescript_agent_enabled
  augroup TypeScriptAgentComplete
    autocmd!
    autocmd FileType typescript,typescriptreact setlocal omnifunc=TSAgentComplete
  augroup END
endif

echo 'TypeScript Agent plugin loaded'
