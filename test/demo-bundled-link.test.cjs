// 从 bundled 文档（如使用说明 guide.md）点击简单文件名 Markdown 链接的回归测试。
// 背景 bug：点击 [Demo](demo.md) 走「本地相对链接」分支（tab.filePath 存在 → addTab），
// 创建的 tab 没设 isBundled=true → processImages 不启用 read_bundled_image_as_base64 回退，
// demo.md 内相对图片（assets/icon.png）显示为红色失败框。
// 修复：简单文件名 href 先 read_bundled_file 探针，命中走 _openBundledFile（isBundled=true）；
// 未命中（用户自己的笔记）走原本地路径，行为不变。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, waitForEditor, delay } = require('./helpers/app-env.cjs');

async function makeEditor(invokeImpl) {
  const { w } = await buildEnv({ invokeImpl });
  const ed = await waitForEditor(w);
  return { w, ed };
}

// 模拟从 bundled tab（有 filePath，如 guide.md）点击链接
function clickLink(w, ed, href) {
  const a = w.document.createElement('a');
  a.setAttribute('href', href);
  a.textContent = href;
  ed.preview.appendChild(a);
  a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  return a;
}

const defaultInvoke = (cmd) => {
  if (cmd === 'get_cli_args') return [];
  if (cmd === 'read_bundled_file') return { content: '# Demo', path: 'D:/proj/demo.md' };
  if (cmd === 'read_file') return '# Notes';
  return undefined;
};

test('bundled 资源（demo.md）：探针命中 → isBundled=true，filePath 为真实路径', async () => {
  const { w, ed } = await makeEditor(defaultInvoke);
  try {
    ed.activeTab.filePath = 'D:/docs/guide.md'; // 模拟使用说明 tab
    clickLink(w, ed, 'demo.md');
    await delay(50);
    assert.strictEqual(ed.activeTab.name, 'demo.md', '应打开 demo.md tab');
    assert.strictEqual(ed.activeTab.isBundled, true, 'bundled 资源应标记 isBundled=true（图片回退的前提）');
    assert.strictEqual(ed.activeTab.filePath, 'D:/proj/demo.md', 'filePath 应为 read_bundled_file 返回的真实路径');
  } finally { cleanup(w); }
});

test('非 bundled 本地笔记：探针失败 → 走原本地路径，isBundled 不设', async () => {
  const notBundled = (cmd) => {
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'read_bundled_file') throw new Error('bundled file not found: notes.md');
    if (cmd === 'read_file') return '# Notes';
    return undefined;
  };
  const { w, ed } = await makeEditor(notBundled);
  try {
    ed.activeTab.filePath = 'D:/docs/guide.md';
    clickLink(w, ed, 'notes.md');
    await delay(50);
    assert.strictEqual(ed.activeTab.name, 'notes.md', '应打开本地 notes.md');
    assert.strictEqual(ed.activeTab.filePath, 'D:/docs/notes.md', 'filePath 应由 resolveDocPath 解析');
    assert.ok(!ed.activeTab.isBundled, '普通本地笔记不应标记 isBundled');
  } finally { cleanup(w); }
});

test('子目录链接（含分隔符）：跳过探针，走本地路径', async () => {
  const calls = [];
  const subInvoke = (cmd) => {
    calls.push(cmd);
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'read_file') return '# Sub';
    return undefined;
  };
  const { w, ed } = await makeEditor(subInvoke);
  try {
    ed.activeTab.filePath = 'D:/docs/guide.md';
    calls.length = 0; // 清掉初始化阶段的调用（demo.md 自动打开会触发 read_bundled_file）
    clickLink(w, ed, 'notes/sub.md');
    await delay(50);
    assert.ok(!calls.includes('read_bundled_file'), '含分隔符的链接不应触发 bundled 探针');
    assert.strictEqual(ed.activeTab.filePath, 'D:/docs/notes/sub.md', '应走本地相对路径解析');
    assert.ok(!ed.activeTab.isBundled, '不应标记 isBundled');
  } finally { cleanup(w); }
});

test('重复点击已打开的 bundled tab：不重复创建（_openBundledFile 去重）', async () => {
  const { w, ed } = await makeEditor(defaultInvoke);
  try {
    ed.activeTab.filePath = 'D:/docs/guide.md';
    clickLink(w, ed, 'demo.md');
    await delay(50);
    const afterFirst = ed.tabs.length;
    clickLink(w, ed, 'demo.md');
    await delay(50);
    assert.strictEqual(ed.tabs.length, afterFirst, '重复点击不应新增 tab');
    assert.strictEqual(ed.activeTab.name, 'demo.md', '应停留在 demo.md');
  } finally { cleanup(w); }
});
