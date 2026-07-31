// 标签页操作盲点测试（整理测试库时补充）：
//   addTab / closeTab / switchTab / reorderTab 的纯数据层行为。
// 这些路径会触发 updatePreview / saveSession / updateTabBar 等副作用，测试中以桩隔离，
// 专注验证标签数组与 activeTabIndex 的正确性（与既有 openFilePath 等测试形成互补覆盖）。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

// 隔离标签操作涉及的副作用方法，避免触达真实 Tauri 命令 / 渲染器
function stubTabSideEffects(ed) {
  ed.saveSession = () => {};
  ed.updateTabBar = () => {};
  ed.updatePreview = async () => {};
  ed.addRecentFile = () => {};
  ed.ensureTabLoaded = async () => {};
  ed.updateTabDisplay = () => {};
  ed.updateWordCount = () => {};
  ed.updateOutline = () => {};
  ed.updateExternalChangeBanner = () => {};
  ed.highlightTreeActiveFile = () => {};
  ed._beginPaneLoad = () => {};
  ed._endPaneLoad = () => {};
  ed.refreshFileMeta = () => {};
}

test('tab: addTab 追加标签并成为活动标签', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  stubTabSideEffects(ed);
  const before = ed.tabs.length;
  await ed.addTab('a.md', '# hello', null);
  assert.strictEqual(ed.tabs.length, before + 1, 'addTab 应追加一个标签');
  assert.strictEqual(ed.activeTabIndex, ed.tabs.length - 1, '新标签应为活动标签');
  cleanup(w);
});

test('tab: closeTab 移除当前标签', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  stubTabSideEffects(ed);
  ed.showSaveDialog = async () => 'cancel'; // 隔离未保存确认弹窗
  // 先确保至少 2 个标签，才能真正验证「移除」而非触发「保留空白标签」分支
  await ed.addTab('a.md', '# hello', null);
  const before = ed.tabs.length;
  await ed.closeTab(ed.activeTabIndex);
  assert.strictEqual(ed.tabs.length, before - 1, 'closeTab 应移除一个标签');
  assert.ok(ed.tabs.length >= 1, '至少保留一个标签（不允许 0 标签）');
  cleanup(w);
});

test('tab: switchTab 切换活动标签', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  stubTabSideEffects(ed);
  await ed.addTab('b.md', 'bbb', null); // 至少 2 个标签，活动为最后一个
  const last = ed.activeTabIndex;
  const first = last === 0 ? 1 : 0;
  await ed.switchTab(first);
  assert.strictEqual(ed.activeTabIndex, first, 'switchTab 应切换活动标签');
  cleanup(w);
});

test('tab: reorderTab 调整顺序并跟踪 activeTab', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  stubTabSideEffects(ed);
  await ed.addTab('c.md', 'ccc', null);
  await ed.addTab('d.md', 'ddd', null);
  const orderBefore = ed.tabs.map(t => t.name).join(',');
  const activeBefore = ed.activeTabIndex;
  ed.reorderTab(0, 1); // 把第 0 个拖到第 1 个
  const orderAfter = ed.tabs.map(t => t.name).join(',');
  assert.notStrictEqual(orderAfter, orderBefore, 'reorderTab 应改变顺序');
  if (activeBefore === 0) {
    assert.strictEqual(ed.activeTabIndex, 1, '原活动标签被拖动时，activeTabIndex 应跟随');
  }
  cleanup(w);
});
