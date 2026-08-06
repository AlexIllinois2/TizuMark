// 侧边栏文件目录排序 + 行内显示时间/大小：纯函数 + 渲染顺序 + 控件 i18n
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor() {
  const { w, getInitErr } = await buildEnv({ captureInitErr: true });
  await delay(300); // 等异步初始化完成
  return { w, ed: w.editor, getInitErr };
}

// 共用的假条目集合：2 文件 + 2 目录，名称/时间都乱序
function sampleEntries() {
  return [
    { name: 'c.md', path: '/root/c.md', is_dir: false, mtime: 300, size: 2048 },
    { name: 'a.md', path: '/root/a.md', is_dir: false, mtime: 100, size: 512 },
    { name: 'proj', path: '/root/proj', is_dir: true, mtime: 50, size: 0 },
    { name: 'docs', path: '/root/docs', is_dir: true, mtime: 10, size: 0 },
  ];
}

test('folder-sort: sortFolderEntries name 升序（目录置顶 + 字母序，忽略大小写）', async () => {
  const { w, ed, getInitErr } = await makeEditor();
  try {
    assert.strictEqual(getInitErr(), null, '初始化不应报错');
    const entries = [
      { name: 'Zeta.md', path: '/z', is_dir: false, mtime: 1 },
      { name: 'alpha.md', path: '/a', is_dir: false, mtime: 2 },
      { name: 'Docs', path: '/d', is_dir: true, mtime: 3 },
      { name: 'assets', path: '/as', is_dir: true, mtime: 4 },
    ];
    const sorted = ed.sortFolderEntries(entries, 'name', 'asc');
    assert.deepStrictEqual(sorted.map((e) => e.name), ['assets', 'Docs', 'alpha.md', 'Zeta.md']);
  } finally { cleanup(w); }
});

test('folder-sort: sortFolderEntries name 降序', async () => {
  const { w, ed } = await makeEditor();
  try {
    const sorted = ed.sortFolderEntries(sampleEntries(), 'name', 'desc');
    // 目录仍置顶（docs, proj），组内字母降序：proj > docs；文件：c.md > a.md
    assert.deepStrictEqual(sorted.map((e) => e.name), ['proj', 'docs', 'c.md', 'a.md']);
  } finally { cleanup(w); }
});

test('folder-sort: sortFolderEntries time 升序/降序（目录恒置顶）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const entries = [
      { name: 'a.md', path: '/a', is_dir: false, mtime: 300 },
      { name: 'b.md', path: '/b', is_dir: false, mtime: 100 },
      { name: 'dir1', path: '/d1', is_dir: true, mtime: 999 },
      { name: 'dir2', path: '/d2', is_dir: true, mtime: 1 },
    ];
    const asc = ed.sortFolderEntries(entries, 'time', 'asc');
    assert.deepStrictEqual(asc.map((e) => e.name), ['dir2', 'dir1', 'b.md', 'a.md']);
    const desc = ed.sortFolderEntries(entries, 'time', 'desc');
    assert.deepStrictEqual(desc.map((e) => e.name), ['dir1', 'dir2', 'a.md', 'b.md']);
  } finally { cleanup(w); }
});

test('folder-sort: sortFolderEntries dirFirst=false 时按维度纯混排', async () => {
  const { w, ed } = await makeEditor();
  try {
    const entries = [
      { name: 'file', path: '/f', is_dir: false, mtime: 1 },
      { name: 'dir', path: '/d', is_dir: true, mtime: 2 },
    ];
    const sorted = ed.sortFolderEntries(entries, 'time', 'asc', false);
    assert.deepStrictEqual(sorted.map((e) => e.name), ['file', 'dir']);
  } finally { cleanup(w); }
});

test('folder-sort: formatFileSize 自适应单位', async () => {
  const { w, ed } = await makeEditor();
  try {
    assert.strictEqual(ed.formatFileSize(0), '0 B');
    assert.strictEqual(ed.formatFileSize(512), '512 B');
    assert.strictEqual(ed.formatFileSize(1536), '1.5 KB');
    assert.strictEqual(ed.formatFileSize(2 * 1024 * 1024), '2.0 MB');
    assert.strictEqual(ed.formatFileSize(Math.round(1.2 * 1024 * 1024 * 1024)), '1.2 GB');
  } finally { cleanup(w); }
});

test('folder-sort: formatFileTime 友好格式（今天/今年/跨年/未知）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const now = new Date();
    // 未知（0）→ 空串
    assert.strictEqual(ed.formatFileTime(0), '');
    // 今天某时刻 → HH:mm
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30).getTime();
    const pad = (n) => String(n).padStart(2, '0');
    assert.strictEqual(ed.formatFileTime(today), '14:30');
    // 今年但非今天（与今天差 3 天，同月）→ MM-DD HH:mm
    let day = now.getDate();
    if (day > 3) day -= 3; else day += 3;
    const sameYear = new Date(now.getFullYear(), now.getMonth(), day, 9, 5).getTime();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(day);
    assert.strictEqual(ed.formatFileTime(sameYear), `${mm}-${dd} 09:05`);
    // 跨年固定日期 → YYYY-MM-DD
    assert.strictEqual(ed.formatFileTime(new Date(2020, 0, 15, 9, 5).getTime()), '2020-01-15');
  } finally { cleanup(w); }
});

test('folder-sort: renderFolderTree 按 name 升序渲染，并显示大小/时间', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.TauriApi.listDir = async () => sampleEntries();
    ed.workspaceFolder = '/root';
    ed.settings.fileSortKey = 'name';
    ed.settings.fileSortOrder = 'asc';
    await ed.renderFolderTree();
    const labels = Array.from(w.document.querySelectorAll('#folder-tree .tree-label')).map((e) => e.textContent);
    assert.deepStrictEqual(labels, ['docs', 'proj', 'a.md', 'c.md']);
    // 仅文件显示大小；顺序对应 a.md(512 B) 在前、c.md(2.0 KB) 在后
    const sizes = Array.from(w.document.querySelectorAll('#folder-tree .tree-size')).map((e) => e.textContent);
    assert.deepStrictEqual(sizes, ['512 B', '2.0 KB']);
    // 每个条目都显示时间，且非空
    const times = Array.from(w.document.querySelectorAll('#folder-tree .tree-time')).map((e) => e.textContent);
    assert.strictEqual(times.length, 4);
    times.forEach((t) => assert.ok(t.length > 0, '时间文本不应为空'));
  } finally { cleanup(w); }
});

test('folder-sort: 切换 time 倒序后重新渲染顺序变化', async () => {
  const { w, ed } = await makeEditor();
  try {
    const entries = [
      { name: 'c.md', path: '/root/c.md', is_dir: false, mtime: 300, size: 2048 },
      { name: 'a.md', path: '/root/a.md', is_dir: false, mtime: 100, size: 512 },
      { name: 'proj', path: '/root/proj', is_dir: true, mtime: 999, size: 0 },
      { name: 'docs', path: '/root/docs', is_dir: true, mtime: 10, size: 0 },
    ];
    w.TauriApi.listDir = async () => entries;
    ed.workspaceFolder = '/root';
    ed.settings.fileSortKey = 'name';
    ed.settings.fileSortOrder = 'asc';
    await ed.renderFolderTree();
    const labelsName = Array.from(w.document.querySelectorAll('#folder-tree .tree-label')).map((e) => e.textContent);
    assert.deepStrictEqual(labelsName, ['docs', 'proj', 'a.md', 'c.md']);

    ed.settings.fileSortKey = 'time';
    ed.settings.fileSortOrder = 'desc';
    await ed.renderFolderTree();
    const labelsTime = Array.from(w.document.querySelectorAll('#folder-tree .tree-label')).map((e) => e.textContent);
    assert.deepStrictEqual(labelsTime, ['proj', 'docs', 'c.md', 'a.md']);
  } finally { cleanup(w); }
});

test('folder-sort: 旧后端未返回 size 时文件不显示大小（仅时间）', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 缺少 size 字段（兼容未重编译的旧 list_dir）
    const entries = [
      { name: 'a.md', path: '/root/a.md', is_dir: false, mtime: 100 },
      { name: 'docs', path: '/root/docs', is_dir: true, mtime: 10 },
    ];
    w.TauriApi.listDir = async () => entries;
    ed.workspaceFolder = '/root';
    ed.settings.fileSortKey = 'name';
    ed.settings.fileSortOrder = 'asc';
    await ed.renderFolderTree();
    assert.strictEqual(w.document.querySelectorAll('#folder-tree .tree-size').length, 0, '旧后端无 size 不应渲染大小');
    const times = Array.from(w.document.querySelectorAll('#folder-tree .tree-time')).map((e) => e.textContent);
    assert.strictEqual(times.length, 2);
    times.forEach((t) => assert.ok(t.length > 0));
  } finally { cleanup(w); }
});

test('folder-sort: applyLanguage 刷新排序控件文案（中/英）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const sortKey = w.document.getElementById('folder-sort-key');
    const orderBtn = w.document.getElementById('folder-sort-order');
    assert.ok(sortKey && orderBtn, '排序控件应存在于 DOM');

    ed.settings.language = 'en';
    ed.applyLanguage();
    assert.strictEqual(sortKey.options[0].text, 'Name');
    assert.strictEqual(sortKey.options[1].text, 'Modified');
    assert.strictEqual(orderBtn.title, 'Ascending');
    assert.ok(orderBtn.querySelector('svg'), '排序按钮应渲染 SVG 图标');

    ed.settings.language = 'zh';
    ed.applyLanguage();
    assert.strictEqual(sortKey.options[0].text, '名称');
    assert.strictEqual(sortKey.options[1].text, '修改时间');
    assert.strictEqual(orderBtn.title, '升序');
  } finally { cleanup(w); }
});

test('folder-ctx: 文件树节点右键显示 #context-menu-file-tree 并记录上下文路径', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.TauriApi.listDir = async () => sampleEntries();
    ed.workspaceFolder = '/root';
    await ed.renderFolderTree();
    const menu = w.document.getElementById('context-menu-file-tree');
    assert.ok(menu, '文件树右键菜单容器应存在');
    assert.ok(menu.classList.contains('hidden'), '初始应隐藏');

    // 明确选中 a.md 节点（排序后首个文件节点），避免顺序歧义
    const fileNode = w.document.querySelector('#folder-tree .tree-node[data-path="/root/a.md"]');
    assert.ok(fileNode, '应有 a.md 文件节点');
    const evt = new w.window.Event('contextmenu', { bubbles: false });
    evt.clientX = 10; evt.clientY = 10;
    evt.preventDefault = () => {};
    evt.stopPropagation = () => {};
    fileNode.dispatchEvent(evt);

    assert.ok(!menu.classList.contains('hidden'), '右键后菜单应显示');
    assert.strictEqual(ed._folderCtxPath, '/root/a.md', '应记录被右键文件的路径');
    assert.strictEqual(ed._folderCtxIsDir, false);
    // PR #36 合并后：_fileTreeCtx 同时记录右键目标，驱动 file-* 操作与快捷键
    assert.ok(ed._fileTreeCtx, '应记录 _fileTreeCtx');
    assert.strictEqual(ed._fileTreeCtx.path, '/root/a.md');
    assert.strictEqual(ed._fileTreeCtx.isDir, false);
  } finally { cleanup(w); }
});

test('folder-ctx: 点击「打开所在目录」调用 TauriApi.revealInFolder', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 模拟 Tauri 运行时，使 openContainingFolder 走 revealInFolder 分支
    w.__TAURI__ = { core: { invoke: async () => {} } };
    let called = null;
    w.TauriApi.revealInFolder = async (args) => { called = args; return true; };
    // 文件夹上下文：本身即为目录
    ed._folderCtxPath = '/root/docs';
    ed._folderCtxIsDir = true;
    ed.executeMenuAction('folder-open-containing');
    await delay(10);
    assert.ok(called, 'revealInFolder 应被调用');
    assert.strictEqual(called.path, '/root/docs');
  } finally { cleanup(w); }
});

test('folder-ctx: reveal_in_folder 失败时回退 shell.open 打开父目录', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.__TAURI__ = { core: { invoke: async () => {} } };
    let revealed = null;
    let shelled = null;
    w.TauriApi.revealInFolder = async (args) => { revealed = args; throw new Error('command failed'); };
    w.TauriApi.shellOpen = async (target) => { shelled = target; return true; };
    ed._folderCtxPath = '/root/docs/note.md';
    ed._folderCtxIsDir = false;
    ed.executeMenuAction('folder-open-containing');
    await delay(10);
    assert.strictEqual(shelled, '/root/docs', 'shell.open 应打开父目录');
    assert.ok(revealed, 'reveal 应作为主路径被触发（失败则回退 shell.open）');
  } finally { cleanup(w); }
});

test('folder-ctx: 目录右键——reveal_in_folder 作为主路径被调用（is_dir=true，path=目录本身）', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.__TAURI__ = { core: { invoke: async () => {} } };
    let revealed = null;
    let shelled = null;
    w.TauriApi.revealInFolder = async (args) => { revealed = args; };
    w.TauriApi.shellOpen = async (target) => { shelled = target; return true; };
    ed._folderCtxPath = '/root/docs';
    ed._folderCtxIsDir = true;
    ed.executeMenuAction('folder-open-containing');
    await delay(10);
    assert.ok(revealed, 'reveal 应作为主路径被调用');
    assert.strictEqual(revealed.path, '/root/docs', '目录右键应直接打开该目录本身');
    assert.strictEqual(revealed.isDir, true, '应传 isDir=true（Tauri v2 JS 侧 camelCase）');
    assert.strictEqual(shelled, null, 'reveal 成功时不应再调 shell.open');
  } finally { cleanup(w); }
});

test('folder-ctx: shell.open 返回 false（不可用）时回退 await revealInFolder', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.__TAURI__ = { core: { invoke: async () => {} } };
    let revealed = null;
    w.TauriApi.revealInFolder = async (args) => { revealed = args; };
    w.TauriApi.shellOpen = async () => false;
    ed._folderCtxPath = '/root/docs/note.md';
    ed._folderCtxIsDir = false;
    ed.executeMenuAction('folder-open-containing');
    await delay(10);
    assert.ok(revealed, 'shell.open 不可用时回退 revealInFolder');
    assert.strictEqual(revealed.path, '/root/docs/note.md');
  } finally { cleanup(w); }
});

test('folder-ctx: 路径带 \\\\?\\ 长路径前缀时去掉——reveal 收到无前缀 path', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.__TAURI__ = { core: { invoke: async () => {} } };
    let revealed = null;
    w.TauriApi.revealInFolder = async (args) => { revealed = args; };
    w.TauriApi.shellOpen = async () => true;
    ed._folderCtxPath = '\\\\?\\D:\\project\\a.md';
    ed._folderCtxIsDir = false;
    ed.executeMenuAction('folder-open-containing');
    await delay(10);
    assert.ok(revealed, 'reveal 应作为主路径被调用');
    assert.strictEqual(revealed.path, 'D:\\project\\a.md', '应去掉 \\\\?\\ 前缀');
    assert.strictEqual(revealed.isDir, false);
  } finally { cleanup(w); }
});


test('folder-ctx: 复制文件路径写入剪贴板', async () => {
  const { w, ed } = await makeEditor();
  try {
    let written = null;
    w.navigator.clipboard = { writeText: async (t) => { written = t; } };
    ed._folderCtxPath = '/root/a.md';
    ed.executeMenuAction('folder-copy-path');
    await delay(10);
    assert.strictEqual(written, '/root/a.md');
  } finally { cleanup(w); }
});

test('folder-ctx: applyLanguage 刷新文件树右键菜单文案（中/英）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const item = w.document.querySelector('.context-menu-item[data-action="folder-open-containing"] span');
    assert.ok(item, '菜单项文案 span 应存在');

    ed.settings.language = 'en';
    ed.applyLanguage();
    assert.strictEqual(item.textContent, 'Open Containing Folder');

    ed.settings.language = 'zh';
    ed.applyLanguage();
    assert.strictEqual(item.textContent, '打开所在目录');
  } finally { cleanup(w); }
});

test('folder-sort: 升/降序按钮显示不同箭头图标（升序=上箭头，降序=下箭头）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const orderBtn = w.document.getElementById('folder-sort-order');
    assert.ok(orderBtn, '排序按钮应存在');

    ed.settings.fileSortOrder = 'asc';
    ed.applyLanguage();
    const ascHtml = orderBtn.innerHTML;
    assert.ok(ascHtml.includes('M12 19V5'), '升序应渲染上箭头图标');
    assert.ok(!orderBtn.classList.contains('desc'), '升序不应带 desc class');

    ed.settings.fileSortOrder = 'desc';
    ed.applyLanguage();
    const descHtml = orderBtn.innerHTML;
    assert.ok(descHtml.includes('M12 5v14'), '降序应渲染下箭头图标');
    assert.ok(orderBtn.classList.contains('desc'), '降序应带 desc class');
    assert.notStrictEqual(ascHtml, descHtml, '升/降序图标不应是同一个');
  } finally { cleanup(w); }
});

test('folder-ctx: 菜单首项文案按 is_dir 动态切换（文件夹→打开文件夹 / 文件→打开所在目录）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const span = w.document.getElementById('folder-open-label');
    assert.ok(span, 'folder-open-label span 应存在');

    ed.settings.language = 'zh';
    ed._folderCtxIsDir = false;
    ed.updateFolderMenuLabel();
    assert.strictEqual(span.textContent, '打开所在目录', '文件右键应显示「打开所在目录」');

    ed._folderCtxIsDir = true;
    ed.updateFolderMenuLabel();
    assert.strictEqual(span.textContent, '打开文件夹', '文件夹右键应显示「打开文件夹」');

    ed.settings.language = 'en';
    ed._folderCtxIsDir = true;
    ed.updateFolderMenuLabel();
    assert.strictEqual(span.textContent, 'Open Folder', '英文文件夹应显示 Open Folder');

    ed._folderCtxIsDir = false;
    ed.updateFolderMenuLabel();
    assert.strictEqual(span.textContent, 'Open Containing Folder', '英文文件应显示 Open Containing Folder');
  } finally { cleanup(w); }
});
