// 严重 bug 复现（2026-08-01 用户报告「编辑框与预览不精准匹配」）：
// P1-6 的 _computedPosition dirty 守卫只感知「内容变化」（rebuildScrollSync 强制重建），
// 不感知「布局变化」——图片/字体等异步加载会改变预览 scrollHeight，但位置表冻结在
// 旧布局 → 编辑行 ↔ 预览像素错位。
// 本测试先复现（布局变后滚动同步必须重新测量），修复后转正为回归测试。

const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

function setupAnchors(ed, html) {
  ed.preview.innerHTML = html;
  ed._scrollSyncDirty = true;
  ed._computedPosition(true); // 模拟 updatePreview 后的强制重建
  assert.strictEqual(ed._scrollSyncDirty, false, '重建后 dirty 应清除');
}

test('布局变化后滚动同步应重新测量位置表（图片异步加载场景）', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('# 标题\n\n正文段落\n\n## 小节\n\n更多正文');
  setupAnchors(ed,
    '<h1 data-source-line="1">标题</h1><p data-source-line="3">正文</p>' +
    '<img src="assets/img.png" data-source-line="4"><h2 data-source-line="5">小节</h2>');

  // 图片加载完成 → 预览高度变化（scrollHeight 改变，jsdom 默认 0，模拟为加载后 800）
  const cachedList = ed._editorElementList;
  Object.defineProperty(ed.preview, 'scrollHeight', { value: 800, configurable: true });

  // 用户滚动编辑区 → 滚动同步
  ed._syncEditorToPreview(60);

  // 关键断言：布局已变，位置表必须重建（引用变化），否则编辑/预览错位
  assert.notStrictEqual(ed._editorElementList, cachedList,
    '布局变化后滚动同步不得使用旧位置表（编辑与预览会错位）');
}));

test('布局不变时滚动同步仍命中缓存（P1-6 性能优化保留）', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('# 标题\n\n正文段落\n\n## 小节');
  setupAnchors(ed,
    '<h1 data-source-line="1">标题</h1><p data-source-line="3">正文</p><h2 data-source-line="5">小节</h2>');

  const cachedList = ed._editorElementList;
  // 无布局变化：滚动同步不应重建（性能优化）
  ed._syncEditorToPreview(30);
  ed._syncEditorToPreview(90);
  assert.strictEqual(ed._editorElementList, cachedList, '布局未变时滚动同步应命中缓存');
}));
