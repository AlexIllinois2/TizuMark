// 跨文件搜索（跨文件搜索弹框）功能详细回归测试
// 覆盖 find-bugfix.test.cjs 之外的盲点：
//   A. CSS 灰色遮罩修复回归（第 6 项核心 bug：.dialog-overlay 灰色背景必须被高特异性选择器覆盖）
//   B. 「目录」范围真正发起 search_in_files 调用并渲染结果（第 2 项 dir 分支执行路径）
//   C. 「浏览」按钮接线（点击触发 dialogOpen({directory:true})，第 4 项浏览按钮）
//   D. 标题栏拖动在视口边缘夹取（第 5 项）
//   E. 非模态：aria-modal=false（第 6 项「弹窗存在时正常操作软件」）
//   F. 样式一致性：浏览按钮用共享 .dialog-btn（第 4 项）
//   G. Enter 键流程：无结果→重新搜索；有结果且 query 未变→跳下一条（第 1 项循环查找联动）
//
// 复用 init-smoke / find-bugfix 的 jsdom 加载方式，但 buildEnv 支持注入自定义 invoke 实现，
// 因为 dialogOpen 与 search_in_files 都经 window.__TAURI__.core.invoke 走（app.js:1 解构捕获）。

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

function cleanup(w) {
  try { if (w.editor && w.editor.cm && w.editor.cm.close) w.editor.cm.close(); } catch (_) {}
  try { if (w.close) w.close(); } catch (_) {}
}

// invokeImpl: (cmd, args) => any；默认对未知命令返回 undefined（与真实 stub 行为一致）
function buildEnv(invokeImpl) {
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
    core: { invoke: async (cmd, args) => (invokeImpl ? invokeImpl(cmd, args) : undefined) },
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

// ---------- A. CSS 灰色遮罩修复回归（第 6 项核心 bug）----------
test('css: 跨文件搜索 overlay 必须用 .dialog-overlay.cross-search-overlay 高特异性覆盖灰色背景', () => {
  // 基础 .dialog-overlay 仍保留灰色半透明遮罩（其它模态弹窗需要它）
  assert.ok(/\.dialog-overlay\s*\{[^}]*background-color:\s*rgba\(0,\s*0,\s*0,\s*0\.5\)/s.test(css),
    '基础 .dialog-overlay 应保留灰色背景（rgba(0,0,0,0.5)）');
  // 修复后：存在 双类选择器，且声明 background: transparent，确保覆盖基础灰色背景
  assert.ok(/\.dialog-overlay\.cross-search-overlay\s*\{[^}]*background:\s*transparent/s.test(css),
    '应存在 .dialog-overlay.cross-search-overlay 且 background: transparent（修复灰色遮罩的关键）');
  // 该规则还必须保持 pointer-events: none（弹窗存在时编辑器可交互）
  assert.ok(/\.dialog-overlay\.cross-search-overlay\s*\{[^}]*pointer-events:\s*none/s.test(css),
    '跨文件 overlay 必须 pointer-events: none（弹窗存在时编辑器仍可点击/编辑）');
  // 回归护栏：不能再保留旧的低特异性单类 .cross-search-overlay { （会被 .dialog-overlay 的灰色覆盖而失效）
  const standalone = /\.cross-search-overlay\s*\{/m.test(css);
  // 注意：.cross-search-overlay .dialog {（后代选择器）不在此列，需用「{ 紧跟在类名后」来判定
  const onlyStandalone = /(^|\n)\.cross-search-overlay\s*\{/.test(css);
  assert.strictEqual(onlyStandalone, false,
    '不应再保留旧的低特异性单类 .cross-search-overlay { 规则，否则灰色遮罩会复现');
});

// ---------- E. 非模态：aria-modal=false（第 6 项）----------
test('crossSearch: 弹框为非模态（aria-modal=false），弹窗存在时不阻塞软件', () => {
  const { w } = buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const overlay = w.document.getElementById('cross-search-dialog');
      assert.strictEqual(overlay.getAttribute('aria-modal'), 'false', '跨文件搜索应为非模态（aria-modal=false）');
      assert.ok(overlay.classList.contains('cross-search-overlay'), '应带 cross-search-overlay 类（浮动非模态）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

// ---------- F. 样式一致性：浏览按钮用共享 .dialog-btn-primary（主题色，参考添加字体按钮）----------
test('crossSearch: 浏览按钮使用 .dialog-btn + .dialog-btn-primary（主题色，与设置添加字体按钮一致）', () => {
  const { w } = buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const browse = w.document.getElementById('cs-browse');
      assert.ok(browse, '浏览按钮应存在');
      assert.ok(browse.classList.contains('dialog-btn'), '浏览按钮应使用共享 .dialog-btn 类');
      assert.ok(browse.classList.contains('dialog-btn-primary'), '浏览按钮应使用 .dialog-btn-primary（主题 accent 色，参考设置「添加字体」按钮）');
      const openRadio = w.document.querySelector('input[name="cs-scope"][value="open"]');
      assert.strictEqual(openRadio.type, 'radio', '范围选择应为 radio');
      // 需求 1：跨文件搜索不应再有「循环查找」勾选框
      const loopBox = w.document.getElementById('cs-loop');
      assert.strictEqual(loopBox, null, '跨文件搜索不应再有「循环查找」勾选框（已按需求移除）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

// ---------- B. 「目录」范围真正发起 search_in_files 并渲染（第 2 项 dir 分支执行路径）----------
test('crossSearch: 选择「目录」范围时发起 search_in_files 并渲染结果', async () => {
  const calls = [];
  const { w } = buildEnv(async (cmd, args) => {
    if (cmd === 'search_in_files') {
      calls.push({ cmd, args });
      return [{ path: '/proj/notes.md', matches: [{ line: 3, col: 1, line_text: 'hello there' }] }];
    }
    return undefined;
  });
  await new Promise(r => setTimeout(r, 300));
  const ed = w.editor;
  ed.openCrossSearchDialog();
  // 切到「目录」范围
  const dirRadio = w.document.querySelector('input[name="cs-scope"][value="dir"]');
  dirRadio.checked = true;
  dirRadio.dispatchEvent(new w.Event('change'));
  w.document.getElementById('cs-dir').value = '/proj';
  w.document.getElementById('cs-query').value = 'hello';
  await ed.runCrossSearch();
  assert.strictEqual(calls.length, 1, '应发起一次 search_in_files 调用');
  assert.strictEqual(calls[0].cmd, 'search_in_files');
  assert.strictEqual(calls[0].args.dir, '/proj', '调用应带上目录参数');
  assert.strictEqual(calls[0].args.pattern, 'hello', '调用应带上搜索内容');
  assert.strictEqual(ed.crossSearchFlat.length, 1, '应收集 1 处目录匹配');
  assert.strictEqual(ed.crossSearchFlat[0].filePath, '/proj/notes.md', '匹配路径应为 /proj/notes.md');
  const matchEl = w.document.querySelector('#cs-results .cs-match');
  assert.ok(matchEl, '结果区应渲染出匹配项');
  cleanup(w);
});

test('crossSearch: 「目录」范围但目录为空时显示无结果且不崩', async () => {
  const { w } = buildEnv(async (cmd) => {
    if (cmd === 'search_in_files') return []; // 空目录
    return undefined;
  });
  await new Promise(r => setTimeout(r, 300));
  const ed = w.editor;
  ed.openCrossSearchDialog();
  const dirRadio = w.document.querySelector('input[name="cs-scope"][value="dir"]');
  dirRadio.checked = true;
  dirRadio.dispatchEvent(new w.Event('change'));
  w.document.getElementById('cs-dir').value = '';
  w.document.getElementById('cs-query').value = 'hello';
  let threw = null;
  try { await ed.runCrossSearch(); } catch (e) { threw = e; }
  assert.strictEqual(threw, null, '空目录不应抛错');
  assert.strictEqual(w.document.getElementById('cs-total').textContent, ed.t('noResults'), '空目录应提示无结果');
  cleanup(w);
});

// ---------- C. 「浏览」按钮接线（第 4 项浏览按钮）----------
test('crossSearch: 点击「浏览」触发 dialogOpen({directory:true})', () => {
  const calls = [];
  const { w } = buildEnv(async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'plugin:dialog|open') return '/chosen/dir';
    return undefined;
  });
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      ed.openCrossSearchDialog();
      const dirRadio = w.document.querySelector('input[name="cs-scope"][value="dir"]');
      dirRadio.checked = true;
      dirRadio.dispatchEvent(new w.Event('change'));
      w.document.getElementById('cs-browse').click();
      // dialogOpen 是异步（await invoke），用微任务等待
      setTimeout(() => {
        const open = calls.find(c => c.cmd === 'plugin:dialog|open');
        assert.ok(open, '点击浏览应调用 dialogOpen（plugin:dialog|open）');
        assert.strictEqual(open.args.options.directory, true, '浏览应为目录选择（directory:true）');
        assert.strictEqual(w.document.getElementById('cs-dir').value, '/chosen/dir', '选中目录应回填到输入框');
        cleanup(w);
        resolve();
      }, 50);
    }, 300);
  });
});

// ---------- D. 标题栏拖动在视口边缘夹取（第 5 项）----------
test('crossSearch: 拖动时面板位置被夹取在视口内', () => {
  const { w } = buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      ed.openCrossSearchDialog();
      const panel = w.document.getElementById('cs-panel');
      const handle = w.document.getElementById('cs-drag-handle');
      const vw = w.innerWidth || 1024;
      const vh = w.innerHeight || 768;
      // 从 (200,100) 按下，拖到极左上方 -> left/top 应夹到 0
      handle.dispatchEvent(new w.MouseEvent('mousedown', { clientX: 200, clientY: 100, bubbles: true }));
      w.document.dispatchEvent(new w.MouseEvent('mousemove', { clientX: -5000, clientY: -5000, bubbles: true }));
      w.document.dispatchEvent(new w.MouseEvent('mouseup', { clientX: -5000, clientY: -5000, bubbles: true }));
      let left = parseInt(panel.style.left, 10);
      let top = parseInt(panel.style.top, 10);
      assert.ok(left >= 0 && top >= 0, `极左上拖动后面板应夹在视口内 (left=${left}, top=${top})`);
      // 再拖到极右下方 -> left <= vw-80, top <= vh-40
      handle.dispatchEvent(new w.MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      w.document.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 5000, clientY: 5000, bubbles: true }));
      w.document.dispatchEvent(new w.MouseEvent('mouseup', { clientX: 5000, clientY: 5000, bubbles: true }));
      left = parseInt(panel.style.left, 10);
      top = parseInt(panel.style.top, 10);
      assert.ok(left <= vw - 80, `极右下拖动后 left 应 <= vw-80 (left=${left}, vw=${vw})`);
      assert.ok(top <= vh - 40, `极右下拖动后 top 应 <= vh-40 (top=${top}, vh=${vh})`);
      cleanup(w);
      resolve();
    }, 300);
  });
});

// ---------- G. Enter 键流程：无结果→搜索；有结果且 query 未变→跳下一条（第 1 项联动）----------
test('crossSearch: Enter 键 — 无结果时重新搜索，有结果且 query 未变时跳到下一条', async () => {
  const { w } = buildEnv();
  await new Promise(r => setTimeout(r, 300));
  const ed = w.editor;
  // 准备两个打开的文件，供 searchOpenFiles 使用
  ed.tabs = [
    { name: 'a.md', filePath: '/a.md', content: 'hello world\nhello js', _loaded: true },
    { name: 'b.md', filePath: '/b.md', content: 'hello again', _loaded: true },
  ];
  ed.activeTabIndex = 0;
  ed.openCrossSearchDialog();
  const query = w.document.getElementById('cs-query');
  query.value = 'hello';
  // 首次 Enter：无结果 -> 应触发 runCrossSearch
  let searchCalled = false;
  const origRun = ed.runCrossSearch.bind(ed);
  ed.runCrossSearch = async function () { searchCalled = true; return origRun(); };
  query.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  // runCrossSearch 是 async，给一个微任务等待
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(searchCalled, true, '首次 Enter（无结果）应触发搜索');
  assert.strictEqual(ed.crossSearchFlat.length, 3, '应收集 3 处 hello（a.md 2 + b.md 1）');
  // 第二次 Enter：query 未变且有结果 -> 应走 csNextMatch（跳下一条），而非重新搜索
  let nextCalled = false;
  const origNext = ed.csNextMatch.bind(ed);
  ed.csNextMatch = function () { nextCalled = true; return origNext(); };
  // 重置 search 标记，方便判定
  searchCalled = false;
  // 隔离 jumpToMatch 副作用
  ed.jumpToMatch = async () => {};
  query.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(nextCalled, true, '有结果且 query 未变时 Enter 应跳到下一条');
  assert.strictEqual(searchCalled, false, '有结果且 query 未变时 Enter 不应重新搜索');
  cleanup(w);
});
