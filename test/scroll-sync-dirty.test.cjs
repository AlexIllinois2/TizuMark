// P1-6（2026-08-01 审查修复）：_computedPosition dirty 守卫测试。
// 背景：滚动同步热路径（_syncEditorToPreview/_syncPreviewToEditor）每次滚动都全量重建
// 逐行位置数组（O(行数) heightAtLine 循环）；内容未变时纯属浪费。修复：内容变化
// （updatePreview→rebuildScrollSync）后置 dirty，滚动同步仅在 dirty 时重建。
// 本测试直接摆状态验证 dirty/force 语义（不依赖真实 unified 渲染）。

const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

test('_computedPosition: dirty 时重建、clean 时命中缓存、force 强制重建', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  // 构造滚动同步所需的锚点 DOM（data-source-line 元素）
  ed.cm.setValue('# 标题\n\n正文\n\n## 小节');
  ed.preview.innerHTML = '<h1 data-source-line="1">标题</h1><p data-source-line="3">正文</p><h2 data-source-line="5">小节</h2>';
  ed._scrollSyncDirty = true;

  // 1) dirty → 重建
  ed._computedPosition();
  assert.ok(ed._editorElementList && ed._editorElementList.length >= 2, '应构建位置数组');
  assert.strictEqual(ed._scrollSyncDirty, false, '重建成功后应清除 dirty');

  // 2) clean + 无 force（滚动热路径语义）→ 命中缓存，不重建（引用不变）
  const cached = ed._editorElementList;
  ed._computedPosition();
  assert.strictEqual(ed._editorElementList, cached, '内容未变时不得重建（同一数组引用）');

  // 3) force=true（内容/布局变化的权威调用点）→ 强制重建
  ed._computedPosition(true);
  assert.notStrictEqual(ed._editorElementList, cached, 'force 应强制重建');
  assert.strictEqual(ed._scrollSyncDirty, false, '重建后应清除 dirty');

  // 4) 锚点不足时列表置 null 且 dirty 保持 true（下次调用自动重试）
  ed.preview.innerHTML = '<p>无锚点段落</p>';
  ed._scrollSyncDirty = true;
  ed._computedPosition();
  assert.strictEqual(ed._editorElementList, null, '锚点不足应置 null');
  assert.strictEqual(ed._scrollSyncDirty, true, '重建失败不清 dirty，下次调用自动重试');
}));

test('_syncEditorToPreview: 内容未变时连续调用不重建位置数组', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('# 标题\n\n正文\n\n## 小节');
  ed.preview.innerHTML = '<h1 data-source-line="1">标题</h1><p data-source-line="3">正文</p><h2 data-source-line="5">小节</h2>';
  ed._scrollSyncDirty = true;
  ed._computedPosition(); // 首次构建
  assert.strictEqual(ed._scrollSyncDirty, false);

  // 观测「实际重建」：重建会遍历 preview 的 data-source-line 锚点；缓存命中则零扫描
  let domScans = 0;
  const origQ = ed.preview.querySelectorAll.bind(ed.preview);
  ed.preview.querySelectorAll = (sel) => {
    if (sel === '[data-source-line]') domScans++;
    return origQ(sel);
  };

  // 连续多次滚动同步（滚动热路径）——内容未变，应全部命中缓存、零扫描
  ed._syncEditorToPreview(10);
  ed._syncEditorToPreview(200);
  ed._syncPreviewToEditor(0);
  assert.strictEqual(domScans, 0, '滚动热路径不得触发重建（DOM 零扫描）');

  // 内容变化后置 dirty → 下一次同步触发重建（一次扫描）
  ed._scrollSyncDirty = true;
  ed._syncEditorToPreview(50);
  assert.strictEqual(domScans, 1, 'dirty 后应重建一次');
  assert.strictEqual(ed._scrollSyncDirty, false, '重建后清除 dirty');
}));
