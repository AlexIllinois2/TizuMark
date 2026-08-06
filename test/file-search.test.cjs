// 文件搜索（VSCode 风格 Ctrl+P，合并自 PR #36）回归测试。
// 覆盖：扫描工作区仅列 .md/.markdown/.txt 且递归子目录、文件名模糊筛选、
//       Enter 经 window.editor.openFilePath 打开选中文件。

const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

// 小型内存目录树，键为目录绝对路径，值为该目录下的 DirEntryInfo 列表。
const TREE = {
  'C:/ws': [
    { name: 'a.md', path: 'C:/ws/a.md', is_dir: false },
    { name: 'notes.md', path: 'C:/ws/notes.md', is_dir: false },
    { name: 'readme.txt', path: 'C:/ws/readme.txt', is_dir: false },
    { name: 'ignore.js', path: 'C:/ws/ignore.js', is_dir: false }, // 非文本，应排除
    { name: 'sub', path: 'C:/ws/sub', is_dir: true },
  ],
  'C:/ws/sub': [
    { name: 'deep.md', path: 'C:/ws/sub/deep.md', is_dir: false },
  ],
};

function invokeImpl(cmd, args) {
  if (cmd === 'list_dir') return Promise.resolve(TREE[args.path] || []);
  return Promise.resolve(null);
}

const tick = () => new Promise((r) => setTimeout(r, 60));

test('扫描工作区：仅列出 .md/.txt 且递归子目录，排除非文本后缀', async () => withEditor({ captureInitErr: true, invokeImpl }, async (w, ed) => {
  ed.workspaceFolder = 'C:/ws';
  w.openFileSearchDialog();
  await tick();
  const items = w.document.querySelectorAll('#file-search-list .file-search-item');
  // a.md / notes.md / readme.txt / sub/deep.md = 4 个；ignore.js 被排除
  assert.strictEqual(items.length, 4, '应列出 4 个文本文件（排除 ignore.js）');
  const names = [...items].map((i) => i.querySelector('span').textContent);
  assert.ok(names.includes('a.md'), '应包含 a.md');
  assert.ok(names.includes('deep.md'), '应递归包含 sub/deep.md');
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
  assert.strictEqual(items.length, 4, '应回退到活动标签目录扫描出 4 个文本文件');
}));
