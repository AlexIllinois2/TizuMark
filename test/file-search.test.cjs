// 文件搜索（VSCode 风格 Ctrl+P）回归测试。
// 覆盖：扫描工作区仅列 .md/.markdown/.txt 且递归所有子目录（含 node_modules/.git，不跳过）、
//      文件名模糊筛选、Enter 经 window.editor.openFilePath 打开、命令缺失时回退前端递归扫描。

const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

// 内存目录树：键为目录绝对路径，值为该目录下的条目。
// 注意：node_modules / .git 现在【不跳过】，其内 .md 文件应被搜到（仅 .git/HEAD 因扩展名被过滤）。
const TREE = {
  'C:/ws': [
    { name: 'a.md', path: 'C:/ws/a.md', is_dir: false },
    { name: 'notes.md', path: 'C:/ws/notes.md', is_dir: false },
    { name: 'readme.txt', path: 'C:/ws/readme.txt', is_dir: false },
    { name: 'ignore.js', path: 'C:/ws/ignore.js', is_dir: false }, // 非文本，应排除
    { name: 'sub', path: 'C:/ws/sub', is_dir: true },
    // 巨型/隐藏目录现在【不再跳过】，须作为子目录列在父树下，模拟命令会递归进入它们
    { name: 'node_modules', path: 'C:/ws/node_modules', is_dir: true },
    { name: '.git', path: 'C:/ws/.git', is_dir: true },
  ],
  'C:/ws/sub': [
    { name: 'deep.md', path: 'C:/ws/sub/deep.md', is_dir: false },
  ],
  // 巨型目录不再跳过：其内笔记文件应可被搜到
  'C:/ws/node_modules': [
    { name: 'somepkg', path: 'C:/ws/node_modules/somepkg', is_dir: true },
  ],
  'C:/ws/node_modules/somepkg': [
    { name: 'readme.md', path: 'C:/ws/node_modules/somepkg/readme.md', is_dir: false },
  ],
  'C:/ws/.git': [
    { name: 'HEAD', path: 'C:/ws/.git/HEAD', is_dir: false }, // 无 .md 扩展名，过滤后不出现
  ],
};

// 模拟 Rust 端 search_files：递归整棵树（不跳过任何目录），按扩展名过滤。
function searchFilesImpl(args) {
  const root = args.path;
  const exts = (args.extensions || ['md', 'markdown', 'txt']).map((e) => e.toLowerCase());
  const out = [];
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    if (seen.has(d)) continue;
    seen.add(d);
    for (const e of (TREE[d] || [])) {
      if (e.is_dir) { stack.push(e.path); continue; }
      const lower = e.name.toLowerCase();
      const dot = lower.lastIndexOf('.');
      const ext = dot >= 0 ? lower.slice(dot + 1) : '';
      if (exts.includes(ext)) {
        const rel = e.path.startsWith(root)
          ? e.path.slice(root.length).replace(/^[/\\]/, '')
          : e.name;
        out.push({ name: e.name, path: e.path, relativePath: rel });
      }
    }
  }
  return Promise.resolve(out);
}

function invokeImpl(cmd, args) {
  if (cmd === 'search_files') return searchFilesImpl(args);
  if (cmd === 'list_dir') return Promise.resolve(TREE[args.path] || []); // 仅命令缺失回退路径使用
  return Promise.resolve(null);
}

const tick = () => new Promise((r) => setTimeout(r, 60));

test('扫描工作区：递归所有子目录 + 扩展名过滤，node_modules 内笔记也能搜到', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  await tick();
  const items = w.document.querySelectorAll('#file-search-list .file-search-item');
  // a.md / notes.md / readme.txt / sub/deep.md / node_modules/somepkg/readme.md = 5；ignore.js 与 .git/HEAD 被扩展名过滤
  assert.strictEqual(items.length, 5, '应列出 5 个文本文件（含 node_modules 内 readme.md）');
  const names = [...items].map((i) => i.querySelector('span').textContent);
  assert.ok(names.includes('a.md'), '应包含 a.md');
  assert.ok(names.includes('deep.md'), '应递归包含 sub/deep.md');
  assert.ok(names.includes('readme.md'), '应包含 node_modules/somepkg/readme.md（不再跳过）');
  assert.ok(!names.includes('ignore.js'), '应排除非文本后缀 ignore.js');
}));

test('文件名模糊筛选：输入 "note" 仅保留匹配项', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  await tick();
  const input = w.document.getElementById('file-search-input');
  input.value = 'note';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  const items = w.document.querySelectorAll('#file-search-list .file-search-item');
  assert.strictEqual(items.length, 1, '筛选 "note" 应只剩 1 项');
  assert.strictEqual(items[0].querySelector('span').textContent, 'notes.md');
}));

test('Enter 打开选中项：调用 window.editor.openFilePath', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  let opened = null;
  ed.openFilePath = (p) => { opened = p; };
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  await tick();
  const input = w.document.getElementById('file-search-input');
  input.value = 'a.md';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.strictEqual(opened, 'C:/ws/a.md', 'Enter 应经 openFilePath 打开 a.md');
}));

test('无工作区时降级：以当前活动标签所在目录扫描', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = null;
  ed.activeTab.filePath = 'C:/ws/notes.md'; // activeTab 存在，取其父目录
  w.openFileSearchDialog();
  await tick();
  const items = w.document.querySelectorAll('#file-search-list .file-search-item');
  assert.strictEqual(items.length, 5, '应回退到活动标签目录扫描出 5 个文本文件');
}));

test('不跳过任何文件夹：node_modules 内 readme.md 必须出现在结果中', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  await tick();
  const items = w.document.querySelectorAll('#file-search-list .file-search-item');
  const names = [...items].map((i) => i.querySelector('span').textContent);
  assert.ok(names.includes('readme.md'), 'node_modules 内的 readme.md 必须被搜到（不跳过任何目录）');
}));

test('扫描期间输入的文字在扫描完成后仍生效（不被覆盖）', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  const input = w.document.getElementById('file-search-input');
  input.value = 'note';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick();
  const items = w.document.querySelectorAll('#file-search-list .file-search-item');
  assert.strictEqual(items.length, 1, '扫描结束后应保留输入筛选，仅剩 notes.md');
  assert.strictEqual(items[0].querySelector('span').textContent, 'notes.md');
}));

test('命令缺失时回退前端 list_dir 递归扫描（保证不整体失效）', async () => {
  await withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
    const saved = w.TauriApi.searchFiles;
    delete w.TauriApi.searchFiles; // 模拟极旧构建无此命令 → 前端走 list_dir 回退
    try {
      ed.workspaceFolder = 'C:/ws';
      w.openFileSearchDialog();
      await tick();
      const items = w.document.querySelectorAll('#file-search-list .file-search-item');
      assert.strictEqual(items.length, 5, '回退路径也应搜到 5 个文本文件');
    } finally {
      w.TauriApi.searchFiles = saved;
    }
  });
});

test('浮动面板（file-search-overlay + 拖动手柄），打开时定位', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  await tick();
  const dlg = w.document.getElementById('file-search-dialog');
  assert.ok(dlg.classList.contains('file-search-overlay'), 'overlay 应带 file-search-overlay 类（与 Ctrl+H 的 cross-search-overlay 对应）');
  assert.strictEqual(dlg.getAttribute('aria-modal'), 'true', '应可点击面板外关闭（aria-modal 标记为模态）');
  assert.ok(w.document.getElementById('fs-drag-handle'), '标题栏应带拖动手柄 fs-drag-handle（与 cs-drag-handle 对应）');
  const panel = w.document.getElementById('fs-panel');
  assert.ok(panel && panel.style.left && panel.style.top, '打开时浮动面板应被定位（设置 left/top，支持拖动）');
}));

test('点击面板以外区域可关闭弹框；面板内点击不关闭；X 与 ESC 仍可关闭', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  await tick();
  const dlg = w.document.getElementById('file-search-dialog');
  const panel = w.document.getElementById('fs-panel');
  assert.ok(!dlg.classList.contains('hidden'), '打开后可见');

  // 点击面板外的文档区域（模拟点击遮罩/编辑器，target 不在面板内）应关闭
  w.document.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
  assert.ok(dlg.classList.contains('hidden'), '点击面板外（document.body）应关闭弹框');

  // 重新打开：点击面板内部（标题栏等）不应关闭
  w.openFileSearchDialog();
  await tick();
  panel.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
  assert.ok(!dlg.classList.contains('hidden'), '点击面板内部不应关闭');

  // 输入框 ESC 应关闭
  const input = w.document.getElementById('file-search-input');
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(dlg.classList.contains('hidden'), '输入框 ESC 应关闭');
}));
