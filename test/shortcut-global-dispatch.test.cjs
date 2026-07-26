// 全局快捷键统一由 document 级 keydown 派发（修复：编辑器内有焦点时 Ctrl+Shift+F
// 等全局快捷键偶发失效）。验证：
//  1. 编辑器有焦点时按 Ctrl+Shift+F 打开跨文件搜索（不再依赖 CM extraKeys）
//  2. 编辑器有焦点时按 Ctrl+F 打开页面内查找（且不双击关闭）
//  3. 编辑器无焦点（焦点在 body）时同样能打开
//  4. CM extraKeys 中全局键被置为 false，CM 默认键位（search.js 的 replace）不会抢触发
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, waitForEditor } = require('./helpers/app-env.cjs');

function dispatchKey(w, target, key, code, keyCode, mods = {}) {
  const evt = new w.KeyboardEvent('keydown', {
    key, code, keyCode, which: keyCode, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift,
    altKey: !!mods.alt, metaKey: !!mods.meta, bubbles: true, cancelable: true,
  });
  target.dispatchEvent(evt);
  return evt;
}

// 先等编辑器就绪，再延迟 ms 让焦点/事件稳定；用 try/catch 把断言错误转为 rejection，
// 避免异常被吞在 setTimeout 回调内导致用例永久 pending（表现为整文件超时被杀）。
function withEditorReady(w, ms, body) {
  return waitForEditor(w).then(() => new Promise((resolve, reject) => {
    setTimeout(() => {
      try { body(); resolve(); } catch (e) { reject(e); }
    }, ms);
  }));
}

test('全局快捷键：编辑器有焦点时 Ctrl+Shift+F 打开跨文件搜索', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  require('codemirror/addon/search/search.js'); // 加载真实 search.js（提供默认 Shift-Ctrl-F→replace）
  return withEditorReady(w, 400, () => {
    const cm = w.editor.cm;
    const dlg = w.document.getElementById('cross-search-dialog');
    const inner = cm.getWrapperElement().querySelector('.CodeMirror-code') || cm.getWrapperElement();
    cm.focus();
    assert.ok(dlg.classList.contains('hidden'), '前置：跨文件搜索应关闭');
    dispatchKey(w, inner, 'F', 'KeyF', 70, { ctrl: true, shift: true });
    assert.ok(!dlg.classList.contains('hidden'), '编辑器有焦点时 Ctrl+Shift+F 应打开跨文件搜索');
    assert.strictEqual(typeof cm.getOption('extraKeys')['Shift-Ctrl-F'], 'function',
      'CM extraKeys 中 Shift-Ctrl-F 应被中性化为禁用默认 replace 的处理器（function 返回 false）');
    cleanup(w);
  });
});

test('全局快捷键：编辑器有焦点时 Ctrl+F 打开页面内查找（单击不关闭）', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return withEditorReady(w, 400, () => {
    const cm = w.editor.cm;
    const ed = w.editor;
    ed.viewMode = 'edit'; // 测试编辑模式下的编辑器内查找面板
    const panel = w.document.getElementById('find-panel');
    const inner = cm.getWrapperElement().querySelector('.CodeMirror-code') || cm.getWrapperElement();
    let calls = 0;
    const orig = ed.toggleFindPanel.bind(ed);
    ed.toggleFindPanel = function (...a) { calls++; return orig(...a); };
    cm.focus();
    assert.ok(panel.classList.contains('hidden'), '前置：查找面板应关闭');
    dispatchKey(w, inner, 'f', 'KeyF', 70, { ctrl: true });
    assert.strictEqual(calls, 1, '编辑器有焦点时 Ctrl+F 应派发一次 toggleFindPanel（不双击）');
    assert.ok(!panel.classList.contains('hidden'), '编辑器有焦点时 Ctrl+F 应打开查找面板');
    cleanup(w);
  });
});

test('全局快捷键：焦点不在编辑器时 Ctrl+Shift+F 仍打开跨文件搜索', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return withEditorReady(w, 400, () => {
    const dlg = w.document.getElementById('cross-search-dialog');
    assert.ok(dlg.classList.contains('hidden'), '前置：跨文件搜索应关闭');
    dispatchKey(w, w.document.body, 'F', 'KeyF', 70, { ctrl: true, shift: true });
    assert.ok(!dlg.classList.contains('hidden'), '焦点在 body 时 Ctrl+Shift+F 应打开跨文件搜索');
    cleanup(w);
  });
});

test('全局快捷键：CM 默认键位 Shift-Ctrl-F(replace) 不会在编辑器内抢触发', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  require('codemirror/addon/search/search.js');
  return withEditorReady(w, 400, () => {
    const cm = w.editor.cm;
    const inner = cm.getWrapperElement().querySelector('.CodeMirror-code') || cm.getWrapperElement();
    cm.focus();
    dispatchKey(w, inner, 'F', 'KeyF', 70, { ctrl: true, shift: true });
    const cmDialog = w.document.querySelector('.CodeMirror-dialog');
    assert.strictEqual(cmDialog, null, '不应出现 CM search.js 的 replace 对话框（被 false 禁用）');
    cleanup(w);
  });
});

test('全局快捷键：真实输入区派发（contenteditable）+ 捕获阶段拦截', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  require('codemirror/addon/search/search.js');
  return withEditorReady(w, 400, () => {
    const ed = w.editor;
    const cm = ed.cm;
    const dlg = w.document.getElementById('cross-search-dialog');
    const field = cm.display.input.getField();
    let called = 0;
    const orig = ed.openCrossSearchDialog.bind(ed);
    ed.openCrossSearchDialog = (...a) => { called++; return orig(...a); };
    cm.focus();
    assert.ok(dlg.classList.contains('hidden'), '前置：跨文件搜索应关闭');
    // 在 CM 真正的输入区派发（真实浏览器 keydown 的 target 就是它）
    dispatchKey(w, field, 'F', 'KeyF', 70, { ctrl: true, shift: true });
    assert.ok(!dlg.classList.contains('hidden'), '真实输入区内 Ctrl+Shift+F 应打开跨文件搜索');
    assert.strictEqual(called, 1, '仅由捕获阶段处理器派发一次（不重复）');
    cleanup(w);
  });
});

test('全局快捷键：e.key 异常(小写/控制字符)但 e.code=KeyF 时仍能匹配', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return withEditorReady(w, 400, () => {
    const ed = w.editor;
    const cm = ed.cm;
    const dlg = w.document.getElementById('cross-search-dialog');
    let called = 0;
    const orig = ed.openCrossSearchDialog.bind(ed);
    ed.openCrossSearchDialog = (...a) => { called++; return orig(...a); };
    cm.focus();
    // 模拟个别浏览器下 Ctrl+Shift+F 的 e.key 并非大写 'F'（如某些布局给小写 'f'
    // 或控制字符），但物理键 code 仍是 'KeyF' —— 应靠 e.code 正确匹配。
    dispatchKey(w, w.document.body, 'f', 'KeyF', 70, { ctrl: true, shift: true });
    assert.strictEqual(called, 1, 'e.code=KeyF 时应仍能匹配 Ctrl+Shift+F 并打开跨文件搜索');
    assert.ok(!dlg.classList.contains('hidden'), '跨文件搜索应已打开');
    cleanup(w);
  });
});
