// 搜索高亮回归测试（覆盖两条需求）：
//   需求1：文件内搜索时，编辑框、预览框（编辑模式与预览并排的预览面板）、预览模式都要黄色高亮
//   需求2：跨文件搜索时，编辑框、预览框、预览模式都要黄色高亮
//
// 复用 jsdom + 真实 CodeMirror 实例的 harness；updatePreview 在测试中桩化为可控渲染，
// 以隔离 UnifiedRenderer 依赖、稳定断言预览高亮。跨文件跳转的“文件切换”用 openFilePath 桩隔离，
// 专注验证高亮逻辑（实际文件切换已由 openFilePath 既有测试覆盖）。

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

function cleanup(w) {
  try { if (w.editor && w.editor.cm && w.editor.cm.close) w.editor.cm.close(); } catch (_) {}
  try { if (w.close) w.close(); } catch (_) {}
}

function buildEnv() {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.localStorage.setItem('tizumark-eula-accepted', 'true');
  const rect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
  w.Range.prototype.getBoundingClientRect = rect;
  w.Range.prototype.getClientRects = () => [];
  w.Element.prototype.getBoundingClientRect = rect;
  w.Element.prototype.getClientRects = () => [];
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  w.matchMedia = () => ({ matches: false, media: '', onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
  const tauri = {
    core: { invoke: async () => undefined },
    event: { listen: async () => () => {} },
    window: { getCurrentWindow: () => ({ unminimize: async () => {}, show: async () => {}, setFocus: async () => {}, isMaximized: async () => false }) },
    path: { resourceDir: async () => '' },
    shell: { open: async () => {} },
  };
  w.__TAURI__ = tauri;
  global.window = w;
  global.document = w.document;
  global.navigator = w.navigator;
  w.CodeMirror = require('codemirror');
  require('codemirror/addon/search/searchcursor');
  const modulesDir = path.join(ROOT, 'src', 'modules');
  for (const f of fs.readdirSync(modulesDir).filter(x => x.endsWith('.js'))) {
    try { w.eval(fs.readFileSync(path.join(modulesDir, f), 'utf8')); } catch (_) {}
  }
  w.eval(appjs);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w };
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// 把 updatePreview 桩化为可控渲染：直接把内容写进 #preview，便于断言预览高亮
function stubPreview(w, text) {
  const ed = w.editor;
  ed.preview.innerHTML = text; // 立即写入，供同步高亮（toggleFindPanel）读取
  ed.updatePreview = async () => { ed.preview.innerHTML = text; };
}

// 准备一个已加载的当前 tab 并写入编辑器内容；隔离文件切换
function setupTab(w, content) {
  const ed = w.editor;
  ed.tabs = [{ name: 'a.md', filePath: '/a.md', content, _loaded: true }];
  ed.activeTabIndex = 0;
  ed.cm.setValue(content);
  ed.openFilePath = async () => {}; // 隔离文件切换，专注验证高亮逻辑
}

// ---------- 需求2：跨文件搜索 — 编辑框黄色高亮 ----------
test('crossSearch: 跳转到匹配时在编辑框用 .search-match 高亮（len>0）', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  setupTab(w, 'hello world\nxyz hello end');
  ed.csLastQuery = 'hello';
  stubPreview(w, '<p>hello world</p><p>xyz hello end</p>');
  // 第2行 “xyz hello end” 中 hello 起始列=5(1-based)，长度5
  await ed.jumpToMatch('/a.md', 2, 5, 5);
  assert.strictEqual(ed.crossSearchMarks.length, 1, '应创建一个编辑框高亮 mark');
  const mk = ed.crossSearchMarks[0];
  const r = mk.find();
  assert.strictEqual(ed.cm.getRange(r.from, r.to), 'hello', '高亮文本应为 hello，实际=' + ed.cm.getRange(r.from, r.to));
  cleanup(w);
});

test('crossSearch: 目录搜索 len=0 时按查询在行内定位并高亮（fallback）', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  setupTab(w, 'hello world\nxyz hello end');
  ed.csLastQuery = 'hello';
  stubPreview(w, '<p>hello world</p><p>xyz hello end</p>');
  // 目录搜索后端不返回 len；col=5 为 hello 起始列
  await ed.jumpToMatch('/a.md', 2, 5, 0);
  assert.strictEqual(ed.crossSearchMarks.length, 1, 'fallback 也应创建编辑框高亮 mark');
  const mk = ed.crossSearchMarks[0];
  const r = mk.find();
  assert.strictEqual(ed.cm.getRange(r.from, r.to), 'hello', 'fallback 高亮文本应为 hello');
  cleanup(w);
});

// ---------- 需求2：跨文件搜索 — 预览框 / 预览模式黄色高亮 ----------
test('crossSearch: 编辑模式下跳转时预览面板（预览框）同样黄色高亮', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.viewMode = 'edit';
  setupTab(w, 'hello world\nxyz hello end');
  ed.csLastQuery = 'hello';
  stubPreview(w, '<p>hello world</p><p>xyz hello end</p>');
  await ed.jumpToMatch('/a.md', 2, 5, 5);
  const marks = ed.preview.querySelectorAll('mark.search-match');
  assert.ok(marks.length >= 1, '编辑模式下预览框应出现至少一个 .search-match 高亮，实际=' + marks.length);
  cleanup(w);
});

test('crossSearch: 预览模式下跳转时预览同样黄色高亮', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.viewMode = 'preview';
  setupTab(w, 'hello world\nxyz hello end');
  ed.csLastQuery = 'hello';
  stubPreview(w, '<p>hello world</p><p>xyz hello end</p>');
  await ed.jumpToMatch('/a.md', 2, 5, 5);
  const marks = ed.preview.querySelectorAll('mark.search-match');
  assert.ok(marks.length >= 1, '预览模式下应出现至少一个 .search-match 高亮，实际=' + marks.length);
  cleanup(w);
});

// ---------- 需求1：文件内搜索 — 编辑模式（编辑框 + 预览框并列）黄色高亮 ----------
test('find: 编辑模式下文件中查找，编辑框与预览框都黄色高亮', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.viewMode = 'edit';
  ed.cm.setValue('hello world\nfoo hello bar');
  stubPreview(w, '<p>hello world</p><p>foo hello bar</p>');
  const findPanel = w.document.getElementById('find-panel');
  findPanel.classList.add('hidden'); // 确保首次 toggle 走“打开并高亮”分支
  const fi = w.document.getElementById('find-input');
  fi.value = 'hello';
  ed.toggleFindPanel();
  // 编辑框高亮
  assert.strictEqual(ed.findMarks.length > 0, true, '编辑框应出现 .search-match 高亮');
  // 预览框高亮
  const marks = ed.preview.querySelectorAll('mark.search-match');
  assert.ok(marks.length >= 1, '编辑模式下预览框应出现 .search-match 高亮，实际=' + marks.length);
  cleanup(w);
});

test('find: 预览模式下文件中查找，预览黄色高亮', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.viewMode = 'preview';
  ed.cm.setValue('hello world\nfoo hello bar');
  stubPreview(w, '<p>hello world</p><p>foo hello bar</p>');
  const pfPanel = w.document.getElementById('preview-find-panel');
  pfPanel.classList.add('hidden'); // 确保首次 toggle 走“打开并高亮”分支
  const fi = w.document.getElementById('preview-find-input');
  fi.value = 'hello';
  ed.toggleFindPanel();
  const marks = ed.preview.querySelectorAll('mark.search-match');
  assert.ok(marks.length >= 1, '预览模式下应出现 .search-match 高亮，实际=' + marks.length);
  cleanup(w);
});

// ---------- 清理：跨文件高亮随打开弹框清除 ----------
test('clearCrossSearchHighlights: 打开跨文件搜索弹框应清除上一次跨文件高亮', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.crossSearchMarks = [{ clear() {} }, { clear() {} }];
  ed.openCrossSearchDialog();
  assert.strictEqual(ed.crossSearchMarks.length, 0, '打开跨文件搜索应清空上一次跨文件高亮');
  cleanup(w);
});
