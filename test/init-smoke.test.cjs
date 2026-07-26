// 初始化冒烟测试：防止「new MarkdownEditor() 构造时同步抛错 → 被初始化 catch 吞掉、
// 错误条因 window.editor 未就绪而不显示 → 整页白屏」这类致命回归。
//
// 历史上一次白屏正是 initEditor 中 IME 适配代码误用未声明的局部变量 `cm`
// （应为 this.cm），导致构造即抛 ReferenceError。本测试用 jsdom 真实加载
// index.html + app.js + 全部模块脚本，stub 好 Tauri API 与浏览器 API，
// 触发 DOMContentLoaded 后断言：① window.editor 成功创建；② 未出现致命错误条。
//
// 真实 WebView 具备 ResizeObserver / matchMedia 等浏览器 API，jsdom 缺失，故在此 stub。

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

// 清理：CodeMirror 实例会启动光标闪烁 setInterval、jsdom 也会保留 timer，
// 若不显式关闭，node --test 会一直等待事件循环排空而挂起进程。
function cleanup(w) {
  try { if (w.editor && w.editor.cm && w.editor.cm.close) w.editor.cm.close(); } catch (_) {}
  try { if (w.close) w.close(); } catch (_) {}
}

function buildEnv() {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.localStorage.setItem('tizumark-eula-accepted', 'true'); // 跳过 EULA 等待，直奔初始化
  const rect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
  w.Range.prototype.getBoundingClientRect = rect;
  w.Range.prototype.getClientRects = () => [];
  w.Element.prototype.getBoundingClientRect = rect;
  w.Element.prototype.getClientRects = () => [];

  // jsdom 缺失但真实 WebView 具备的浏览器 API
  const RO = class { observe() {} unobserve() {} disconnect() {} };
  w.ResizeObserver = RO;
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  w.matchMedia = () => ({ matches: false, media: '', onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });

  // Tauri API stub（真实环境由 Rust 注入）。仅返回安全占位，避免 reject 干扰初始化断言。
  const tauri = {
    core: { invoke: async (cmd) => {
      if (cmd === 'get_cli_args') return [];
      if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
      return undefined;
    } },
    event: { listen: async () => () => {} },
    window: { getCurrentWindow: () => ({ unminimize: async () => {}, show: async () => {}, setFocus: async () => {}, isMaximized: async () => false }) },
    path: { resourceDir: async () => '' },
    shell: { open: async () => {} },
  };
  w.__TAURI__ = tauri;

  // codemirror 模块加载时会访问全局 document/window，需先指向 jsdom
  global.window = w;
  global.document = w.document;
  global.navigator = w.navigator;
  w.CodeMirror = require('codemirror');

  // 加载 index.html 注入的模块脚本（定义 FindReplace / Outline / Dialogs / PreviewPost 等全局）
  const modulesDir = path.join(ROOT, 'src', 'modules');
  for (const f of fs.readdirSync(modulesDir).filter(x => x.endsWith('.js'))) {
    try { w.eval(fs.readFileSync(path.join(modulesDir, f), 'utf8')); }
    catch (_) { /* 个别模块可能需要外部库，初始化关键路径已覆盖，忽略加载失败 */ }
  }

  // 捕获初始化错误
  let initErr = null;
  const origErr = console.error;
  console.error = (...a) => {
    const s = String(a[0] || '');
    if (s.includes('Initialization error')) initErr = a[1];
  };
  w.eval(appjs);
  console.error = origErr;

  // 触发 DOMContentLoaded
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  return { w, getInitErr: () => initErr };
}

test('smoke: 应用初始化成功，window.editor 被创建', () => {
  const { w } = buildEnv();
  // 初始化包含 await，给一个 microtask 周期让同步构造完成
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.ok(!!w.editor, 'window.editor 应被成功创建（new MarkdownEditor() 未抛错）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('smoke: 初始化过程未触发致命错误条', () => {
  const { w, getInitErr } = buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(getInitErr(), null, '不应出现 Initialization error');
      const bar = w.document.querySelector('.fatal-error-bar');
      assert.strictEqual(bar, null, '不应显示致命错误条（否则等同于白屏）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('ui: 快捷键对话框方案区与列表区以分组标题区分', () => {
  const { w } = buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const schemeTitle = w.document.getElementById('shortcuts-scheme-label');
      assert.ok(schemeTitle, '#shortcuts-scheme-label 应存在');
      assert.ok(schemeTitle.classList.contains('settings-group-title'), '方案区标题应带 settings-group-title 类（与下方具体项作视觉区分）');
      const listTitle = w.document.getElementById('shortcuts-list-title');
      assert.ok(listTitle, '#shortcuts-list-title 应存在（列表分组标题）');
      assert.ok(listTitle.classList.contains('settings-group-title'), '列表区标题应带 settings-group-title 类');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('ui: 快捷键对话框分组标题支持中英文 i18n', () => {
  const { w } = buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const listTitle = w.document.getElementById('shortcuts-list-title');
      assert.ok(listTitle, '#shortcuts-list-title 应存在');
      // 切英文：t() 读 this.settings.language，applyLanguage() 无参重渲染
      try { w.editor.settings.language = 'en'; w.editor.applyLanguage(); } catch (_) {}
      assert.strictEqual(listTitle.textContent, 'Shortcuts', '切英文后列表标题应为 "Shortcuts"');
      // 切回中文
      try { w.editor.settings.language = 'zh'; w.editor.applyLanguage(); } catch (_) {}
      assert.strictEqual(listTitle.textContent, '快捷键', '切中文后列表标题应为 "快捷键"');
      cleanup(w);
      resolve();
    }, 300);
  });
});
