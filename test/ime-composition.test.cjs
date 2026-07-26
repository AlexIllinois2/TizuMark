/**
 * IME compositionstart 回归测试
 *
 * 背景：之前在 textarea 输入模式下加了 compositionstart 滚动补偿（双向
 * 安全区），试图让候选框不挡当前行。后来切到 inputStyle:'contenteditable'
 * 后 IME 候选框由 WebView2 原生锚定在光标行下方，不再需要滚动补偿。
 * 旧补偿在视口边缘行上会打断 composition + 触发滚动反馈循环，已移除。
 *
 * 本测试验证：compositionstart 事件不再触发任何 cm.scrollTo 调用，
 * 确保不会意外重新引入「composition 期间滚动」的行为。
 *
 * 测试环境：jsdom + 真实 CodeMirror 5 实例
 */

const { JSDOM } = require('jsdom');
const test = require('node:test');
const assert = require('node:assert');

// ── jsdom 全局（必须在 require codemirror 之前）────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor-wrapper" style="height:200px;overflow:hidden;"></div></body></html>', {
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, writable: true, configurable: true,
});
const rect = () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0 });
dom.window.Element.prototype.getBoundingClientRect = rect;
dom.window.Element.prototype.getClientRects = () => [rect()];
dom.window.Range.prototype.getBoundingClientRect = rect;
dom.window.Range.prototype.getClientRects = () => [rect()];

const CodeMirror = require('codemirror');

// ── 辅助：创建 CM 实例 ──────────────────────────────────────────
function createEditor() {
  const cm = CodeMirror(document.getElementById('editor-wrapper'), {
    mode: 'markdown',
    lineNumbers: true,
    value: 'line1\nline2\nline3',
  });
  const editorEl = cm.getWrapperElement();
  cm._scrollCalls = [];
  cm.scrollTo = (x, y) => { cm._scrollCalls.push({ x, y }); };
  return { cm, editorEl };
}

// ── 测试用例 ───────────────────────────────────────────────────────
const results = [];

// T1: compositionstart 不触发 scrollTo（光标在顶部）
{
  const { cm, editorEl } = createEditor();
  cm.setCursor({ line: 0, ch: 0 });
  editorEl.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {
    bubbles: true, cancelable: true, data: 'h',
  }));
  results.push(['compositionstart(顶部)不触发滚动', cm._scrollCalls.length === 0]);
}

// T2: compositionstart 不触发 scrollTo（光标在底部）
{
  const { cm, editorEl } = createEditor();
  cm.setCursor({ line: 2, ch: 0 });
  editorEl.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {
    bubbles: true, cancelable: true, data: 'x',
  }));
  results.push(['compositionstart(底部)不触发滚动', cm._scrollCalls.length === 0]);
}

// T3: compositionstart 不触发 scrollTo（光标在中间）
{
  const { cm, editorEl } = createEditor();
  cm.setCursor({ line: 1, ch: 0 });
  editorEl.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {
    bubbles: true, cancelable: true, data: 'z',
  }));
  results.push(['compositionstart(中间)不触发滚动', cm._scrollCalls.length === 0]);
}

// T4: 连续多次 compositionstart 也不触发滚动
{
  const { cm, editorEl } = createEditor();
  const evt = new dom.window.CompositionEvent('compositionstart', {
    bubbles: true, cancelable: true, data: 'q',
  });
  for (let i = 0; i < 10; i++) editorEl.dispatchEvent(evt);
  results.push(['连续 10 次 compositionstart 不触发滚动', cm._scrollCalls.length === 0]);
}

// ── 输出 ───────────────────────────────────────────────────────────
test('IME compositionstart 不触发滚动（回归）', async () => {
  results.forEach(([name, pass]) => {
    assert.ok(pass, name);
  });
});
