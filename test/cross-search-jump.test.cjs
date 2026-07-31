// 跨文件搜索「点击结果跳转」回归测试
// 复现 bug：跨文件搜索点击结果后编辑区实际已 setSelection，但因为默认进入预览模式、
// 预览面板既没滚动到匹配行、大文档窗口也未把焦点定位到匹配行，用户在预览/分屏模式下“看不到跳转”。
//
// 本测试桩掉真实文件打开/渲染（openFilePath / ensureTabLoaded / updatePreview），只校验跳转核心链路：
//   1. 编辑区 setSelection / setCursor 落在正确的 0-based 行/列；
//   2. 跳转结束后调用 _buildWindowLineTops + _focusPreviewToLine(pos.line)，即预览必须滚动到匹配行。
// 同时覆盖目录搜索 len=0 时按 query 在行内重新定位的区间计算。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

// 构造一个受控的编辑器实例用于跳转校验
function installJumpHarness(ed) {
  ed.tabs = [{ name: 'a.md', filePath: '/a.md', content: 'line1\nline2 Target\nline3', _loaded: true }];
  ed.activeTabIndex = 0;
  ed.csLastQuery = 'Target';
  ed.openFilePath = async () => {};
  ed.ensureTabLoaded = async () => {};
  ed.updatePreview = async () => {};
  ed.highlightPreviewMatches = () => {};
  // 记录预览滚动调用
  const rec = { buildCalled: false, focusLineArg: null, setSel: null, setCur: null, scrolled: null };
  ed._buildWindowLineTops = function () { rec.buildCalled = true; };
  ed._focusPreviewToLine = function (line) { rec.focusLineArg = line; };
  ed.cm = {
    focus() {},
    getLine: (l) => (l === 1 ? 'line2 Target' : ''),
    setSelection: (f, t) => { rec.setSel = { f, t }; },
    setCursor: (p) => { rec.setCur = p; },
    scrollIntoView: (p) => { rec.scrolled = p; },
    markText: () => ({ clear() {} }),
  };
  return rec;
}

test('crossSearch: 点击结果跳转 — 编辑区定位到正确行，且预览滚动到匹配行', async () => {
  const { w } = await buildEnv();
  await delay(300);
  const ed = w.editor;
  const rec = installJumpHarness(ed);

  // line=2 (1-based) -> 0-based 1；col=7 (1-based) -> 0-based 6；len=6 ("Target")
  await ed.jumpToMatch(null, 2, 7, 6);

  // 编辑区：len>0 分支直接用 len 计算区间
  assert.ok(rec.setSel, 'len>0 时应调用 setSelection');
  assert.strictEqual(rec.setSel.f.line, 1, 'from 行应为 0-based 1');
  assert.strictEqual(rec.setSel.f.ch, 6, 'from 列应为 0-based 6');
  assert.strictEqual(rec.setSel.t.ch, 12, 'to 列应为 0-based 12 (6+6)');
  assert.strictEqual(rec.scrolled.line, 1, 'scrollIntoView 应定位到 0-based 1 行');
  assert.strictEqual(rec.scrolled.ch, 6, 'scrollIntoView 应定位到 0-based 6 列');

  // 预览：必须重建行映射并滚动到匹配行（0-based）
  assert.strictEqual(rec.buildCalled, true, '应调用 _buildWindowLineTops 重建预览行映射');
  assert.strictEqual(rec.focusLineArg, 1, '_focusPreviewToLine 应以 0-based 行号调用（line-1）');
  cleanup(w);
});

test('crossSearch: 目录搜索 len=0 时按 query 行内重新定位，并触发预览滚动', async () => {
  const { w } = await buildEnv();
  await delay(300);
  const ed = w.editor;
  const rec = installJumpHarness(ed);

  // 目录搜索后端只返回 line/col，len=0；由 query 在行内重新定位（"Target" 在第 7 列）
  await ed.jumpToMatch(null, 2, 7, 0);

  assert.ok(rec.setSel, 'len=0 但 query 命中时应仍调用 setSelection');
  assert.strictEqual(rec.setSel.f.line, 1, 'from 行应为 0-based 1');
  assert.strictEqual(rec.setSel.f.ch, 6, 'from 列应为 0-based 6（col-1）');
  assert.strictEqual(rec.setSel.t.ch, 12, 'to 列应为 0-based 12（重新定位到 Target 末尾）');
  assert.strictEqual(rec.focusLineArg, 1, '_focusPreviewToLine 应以 0-based 行号调用');
  cleanup(w);
});

test('crossSearch: 大文档窗口 — 跳转前把预览焦点行设为匹配行（确保窗口包含目标行）', async () => {
  const { w } = await buildEnv();
  await delay(300);
  const ed = w.editor;
  const rec = installJumpHarness(ed);

  let focusBeforeRender = null;
  // 捕获 updatePreview 被调用前的 _previewFocusLine
  const origUpdate = ed.updatePreview;
  ed.updatePreview = async function () { focusBeforeRender = ed._previewFocusLine; return origUpdate.apply(this, arguments); };

  await ed.jumpToMatch(null, 50, 3, 4);

  // 大文档滑动窗口以 _previewFocusLine 决定渲染切片；跳转必须先把焦点设为匹配行（0-based 49）
  assert.strictEqual(focusBeforeRender, 49, 'updatePreview 前应已把 _previewFocusLine 设为匹配行（0-based 49）');
  assert.strictEqual(rec.focusLineArg, 49, '_focusPreviewToLine 应以 0-based 49 调用');
  cleanup(w);
});
