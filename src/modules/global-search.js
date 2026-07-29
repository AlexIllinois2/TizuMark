// 全局搜索模块 (VSCode 风格 Ctrl+Shift+F)
// 使用 Rust 后端的 search_in_files 命令进行全文搜索

const __gs_invoke = window.__TAURI__?.core?.invoke;

let __gs_dialog, __gs_inputEl, __gs_resultsEl, __gs_progressEl, __gs_totalEl, __gs_caseCheck, __gs_regexCheck, __gs_runBtn;
let __gs_searchAborted = false;

function initGlobalSearch() {
  __gs_dialog = document.getElementById('global-search-dialog');
  __gs_inputEl = document.getElementById('global-search-input');
  __gs_resultsEl = document.getElementById('global-search-results');
  __gs_progressEl = document.getElementById('global-search-progress');
  __gs_totalEl = document.getElementById('global-search-total');
  __gs_caseCheck = document.getElementById('global-search-case');
  __gs_regexCheck = document.getElementById('global-search-regex');
  __gs_runBtn = document.getElementById('global-search-run');

  if (!__gs_dialog || !__gs_inputEl || !__gs_resultsEl) return;

  const closeBtn = document.getElementById('global-search-close');
  if (closeBtn) closeBtn.addEventListener('click', gsCloseDialog);

  __gs_dialog.addEventListener('click', (e) => {
    if (e.target === __gs_dialog) gsCloseDialog();
  });

  // 阻止所有键盘事件冒泡到编辑器
  __gs_dialog.addEventListener('keydown', (e) => { e.stopPropagation(); });

  __gs_inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); gsRunSearch(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); gsCloseDialog(); }
  });

  if (__gs_runBtn) __gs_runBtn.addEventListener('click', gsRunSearch);
}

async function gsRunSearch() {
  const query = __gs_inputEl ? __gs_inputEl.value.trim() : '';
  if (!query) return;
  if (!__gs_invoke) return;

  let dir = '';
  const ws = window.editor && window.editor.workspaceFolder;
  if (ws) {
    dir = ws;
  } else {
    const tab = window.editor && window.editor.activeTab;
    if (tab && tab.filePath) dir = tab.filePath.replace(/[/\\][^/\\]*$/, '');
  }

  if (!dir) {
    if (__gs_resultsEl) __gs_resultsEl.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px;">请先打开文件夹</div>';
    return;
  }

  __gs_searchAborted = false;
  if (__gs_progressEl) { __gs_progressEl.classList.remove('hidden'); __gs_progressEl.textContent = '搜索中...'; }
  if (__gs_totalEl) __gs_totalEl.textContent = '';
  if (__gs_resultsEl) __gs_resultsEl.innerHTML = '';

  const caseSensitive = __gs_caseCheck ? __gs_caseCheck.checked : false;
  const useRegex = __gs_regexCheck ? __gs_regexCheck.checked : false;

  try {
    const results = await __gs_invoke('search_in_files', {
      dir: dir,
      pattern: query,
      caseSensitive: caseSensitive,
      useRegex: useRegex,
      extensions: ['md', 'markdown', 'txt']
    });

    if (__gs_searchAborted) return;
    if (__gs_progressEl) __gs_progressEl.classList.add('hidden');

    if (!results || results.length === 0) {
      if (__gs_resultsEl) __gs_resultsEl.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px;">无匹配结果</div>';
      if (__gs_totalEl) __gs_totalEl.textContent = '0 处匹配';
      return;
    }

    let totalMatches = 0;
    for (const file of results) {
      totalMatches += file.matches ? file.matches.length : 0;
    }
    if (__gs_totalEl) __gs_totalEl.textContent = `共 ${totalMatches} 处匹配 (${results.length} 个文件)`;

    if (__gs_resultsEl) {
      __gs_resultsEl.innerHTML = results.map(file => {
        const fileName = file.path.split(/[/\\]/).pop();
        const matches = file.matches || [];
        return `
          <div class="cs-file-group">
            <div class="cs-file-header">${fileName} — ${matches.length} 处匹配</div>
            ${matches.map((m) => {
              const lineNum = m.line || 0;
              const lineText = m.line_text || '';
              return `<div class="cs-match" data-file="${file.path}" data-line="${lineNum}" data-col="${m.col || 0}">
                <span class="gs-line">行 ${lineNum}:</span> ${gsEscapeHtml(lineText)}
              </div>`;
            }).join('')}
          </div>`;
      }).join('');

      __gs_resultsEl.querySelectorAll('.cs-match').forEach(el => {
        el.addEventListener('click', () => {
          const filePath = el.dataset.file;
          const line = parseInt(el.dataset.line, 10) || 0;
          const col = parseInt(el.dataset.col, 10) || 0;
          gsJumpToFile(filePath, line, col);
        });
      });
    }
  } catch (e) {
    if (__gs_searchAborted) return;
    if (__gs_progressEl) __gs_progressEl.classList.add('hidden');
    if (__gs_resultsEl) __gs_resultsEl.innerHTML = `<div style="padding:12px;color:var(--color-danger);font-size:13px;">搜索出错: ${gsEscapeHtml(e.toString())}</div>`;
  }
}

function gsJumpToFile(filePath, line, col) {
  if (window.editor && window.editor.jumpToMatch) {
    window.editor.jumpToMatch(filePath, line, col, 0);
  } else if (window.editor && window.editor.openFilePath) {
    window.editor.openFilePath(filePath);
  }
  gsCloseDialog();
}

function gsCloseDialog() {
  __gs_searchAborted = true;
  if (__gs_dialog) __gs_dialog.classList.add('hidden');
  if (__gs_inputEl) __gs_inputEl.value = '';
  if (__gs_resultsEl) __gs_resultsEl.innerHTML = '';
  if (__gs_totalEl) __gs_totalEl.textContent = '';
  if (__gs_progressEl) __gs_progressEl.classList.add('hidden');
  if (window.editor && window.editor.cm) window.editor.cm.focus();
}

function gsEscapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openGlobalSearchDialog() {
  if (!__gs_dialog) initGlobalSearch();
  if (!__gs_dialog) return;
  __gs_dialog.classList.remove('hidden');
  if (__gs_inputEl) { __gs_inputEl.value = ''; __gs_inputEl.focus(); }
  if (__gs_resultsEl) __gs_resultsEl.innerHTML = '';
  if (__gs_totalEl) __gs_totalEl.textContent = '';

  if (window.editor && window.editor.cm) {
    const sel = window.editor.cm.getSelection();
    if (sel) {
      __gs_inputEl.value = sel;
      setTimeout(() => gsRunSearch(), 100);
    }
  }
}