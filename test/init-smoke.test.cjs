// 初始化冒烟测试：防止「new MarkdownEditor() 构造时同步抛错 → 被初始化 catch 吞掉、
// 错误条因 window.editor 未就绪而不显示 → 整页白屏」这类致命回归。
//
// 历史上一次白屏正是 initEditor 中 IME 适配代码误用未声明的局部变量 `cm`
// （应为 this.cm），导致构造即抛 ReferenceError。本测试用 jsdom 真实加载
// index.html + app.js + 全部模块脚本，stub 好 Tauri API 与浏览器 API，
// 触发 DOMContentLoaded 后断言：① window.editor 成功创建；② 未出现致命错误条。
//
// 真实 WebView 具备 ResizeObserver / matchMedia 等浏览器 API，jsdom 缺失，故在此 stub。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup } = require('./helpers/app-env.cjs');

test('smoke: 应用初始化成功，window.editor 被创建', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  // 初始化包含 await，给一个 microtask 周期让同步构造完成
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.ok(!!w.editor, 'window.editor 应被成功创建（new MarkdownEditor() 未抛错）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('smoke: 初始化过程未触发致命错误条', async () => {
  const { w, getInitErr } = await buildEnv({ captureInitErr: true });
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

test('ui: 快捷键对话框方案区与列表区以分组标题区分', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
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

test('ui: 快捷键对话框分组标题支持中英文 i18n', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
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
