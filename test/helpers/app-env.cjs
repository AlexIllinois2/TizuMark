// 共享测试 harness —— 抽离自 7 个测试文件中重复的 buildEnv/cleanup/delay。
// 用法：
//   const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');
//   const { w, getInitErr } = buildEnv({ invokeImpl, captureInitErr: true });
//
// 行为与原各文件内联实现保持一致：
//   - 用 jsdom 加载 src/index.html + src/app.js + src/modules/* + 默认 Tauri stub
//   - 注入 ResizeObserver / IntersectionObserver / matchMedia 等 jsdom 缺失的浏览器 API
//   - 桩化 CodeMirror 测量所需的 getBoundingClientRect / getClientRects
//   - 始终加载 codemirror searchcursor addon（find/replace 依赖）
//   - invokeImpl 缺省时：get_cli_args -> []，app_data_dir -> 'C:/tmp/tizumark-data'（与初始化路径兼容）

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // test/helpers -> repo root
const HTML_PATH = path.join(ROOT, 'src', 'index.html');
const APPJS_PATH = path.join(ROOT, 'src', 'app.js');

function defaultInvoke(cmd) {
  if (cmd === 'get_cli_args') return [];
  if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
  return undefined;
}

function buildEnv(options = {}) {
  // 兼容两种调用：buildEnv(invokeImplFn)（历史签名）与 buildEnv({ invokeImpl, captureInitErr })
  let invokeImpl;
  let captureInitErr = false;
  if (typeof options === 'function') {
    invokeImpl = options;
  } else {
    invokeImpl = options.invokeImpl;
    captureInitErr = options.captureInitErr || false;
  }
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const appjs = fs.readFileSync(APPJS_PATH, 'utf8');

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const w = dom.window;
  // 跳过 EULA 等待，直奔初始化
  w.localStorage.setItem('tizumark-eula-accepted', 'true');

  const rect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
  w.Range.prototype.getBoundingClientRect = rect;
  w.Range.prototype.getClientRects = () => [];
  w.Element.prototype.getBoundingClientRect = rect;
  w.Element.prototype.getClientRects = () => [];

  // jsdom 缺失但真实 WebView 具备的浏览器 API
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  w.matchMedia = () => ({
    matches: false, media: '', onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  });

  const tauri = {
    core: {
      invoke: async (cmd, args) => (invokeImpl ? invokeImpl(cmd, args) : defaultInvoke(cmd)),
    },
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
  require('codemirror/addon/search/searchcursor');

  const modulesDir = path.join(ROOT, 'src', 'modules');
  for (const f of fs.readdirSync(modulesDir).filter(x => x.endsWith('.js'))) {
    try { w.eval(fs.readFileSync(path.join(modulesDir, f), 'utf8')); }
    catch (_) { /* 个别模块可能需要外部库，初始化关键路径已覆盖，忽略加载失败 */ }
  }

  let initErr = null;
  const origErr = console.error;
  if (captureInitErr) {
    console.error = (...a) => {
      const s = String(a[0] || '');
      if (s.includes('Initialization error')) initErr = a[1];
    };
  }
  w.eval(appjs);
  console.error = origErr;

  // 触发 DOMContentLoaded
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  const result = { w };
  if (captureInitErr) result.getInitErr = () => initErr;
  return result;
}

function cleanup(w) {
  try { if (w.editor && w.editor.cm && w.editor.cm.close) w.editor.cm.close(); } catch (_) {}
  try { if (w.close) w.close(); } catch (_) {}
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { buildEnv, cleanup, delay, ROOT };
