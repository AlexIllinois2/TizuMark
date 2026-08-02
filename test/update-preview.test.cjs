// P0-3d（C4/C6/C10）：updatePreview 特征测试。复用 render-extra 的 bundle eval 手法（N12 rAF 可用）。
// 覆盖：① 普通文档正常渲染；② [TOC] 经 generate_toc 替换为 toc-wrapper；
//       ③ 大文档进窗口模式产生 .pv-spacer + .pv-block；④ 窗口模式 data-source-line 加偏移；
//       ⑤ processImages 抛错时后续 PreviewPost 仍执行。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEnv, cleanup, waitForEditor } = require('./helpers/app-env.cjs');
// 产物加载统一走 helpers/load-bundle.cjs（P0-0e）：缺失时给可操作指引而非 ENOENT 堆栈。
// 原先这里用相对路径 readFileSync('src/lib/...')，依赖 cwd —— 换个目录直跑就崩。
const { loadUnifiedRenderer } = require('./helpers/load-bundle.cjs');

function largeDoc(lines = 6000, step = 10) {
  const arr = [];
  for (let i = 0; i < lines; i++) {
    arr.push(i % step === 0 ? `# 标题 ${i}` : `正文段落内容行 ${i}`);
  }
  return arr.join('\n');
}

test('普通文档正常渲染（无窗口模式、无 .pv-spacer）', async () => {
  const { w } = await buildEnv();
  const ed = await waitForEditor(w);
  loadUnifiedRenderer(w);
  try {
    ed.cm.setValue('# 普通标题\n\n一些正文内容。');
    await ed.updatePreview();
    const html = w.editor.preview.innerHTML;
    assert.ok(html.includes('普通标题'), '标题应被渲染');
    assert.ok(html.includes('一些正文内容'), '正文应被渲染');
    assert.equal(w.editor.preview.querySelector('.pv-spacer'), null, '普通文档不应有窗口 spacer');
    assert.equal(w.editor.previewWindow, null, '普通文档 previewWindow 应为 null');
  } finally {
    cleanup(w);
  }
});

test('[TOC] 经 generate_toc 替换为 toc-wrapper（C6）', async () => {
  const tocHtml = '<ul class="toc"><li>标题一</li><li>标题二</li></ul>';
  const { w } = await buildEnv({
    invokeImpl: (cmd) => {
      if (cmd === 'generate_toc') return tocHtml;
      return undefined;
    },
  });
  const ed = await waitForEditor(w);
  loadUnifiedRenderer(w);
  try {
    ed.cm.setValue('# 文档\n\n[TOC]\n\n## 标题一\n\n## 标题二\n');
    await ed.updatePreview();
    const html = w.editor.preview.innerHTML;
    assert.ok(html.includes('toc-wrapper'), '应生成 toc-wrapper 容器');
    assert.ok(html.includes('标题一'), 'TOC 内容应被注入');
  } finally {
    cleanup(w);
  }
});

test('大文档 + 预览模式进入窗口模式，产生 .pv-spacer + .pv-block（C4）', async () => {
  const { w } = await buildEnv();
  const ed = await waitForEditor(w);
  loadUnifiedRenderer(w);
  try {
    ed.viewMode = 'preview'; // 触发 _previewVirtual
    ed.cm.setValue(largeDoc());
    await ed.updatePreview();
    const preview = w.editor.preview;
    assert.ok(w.editor.previewWindow, '大文档应进入窗口模式（previewWindow 非 null）');
    assert.ok(preview.querySelector('.pv-spacer'), '应存在 .pv-spacer 撑高容器');
    assert.ok(preview.querySelector('.pv-block'), '应存在 .pv-block 内容块');
    // 窗口宽度受 2200 行上限约束（N18）
    const win = w.editor.previewWindow;
    assert.ok(win.end - win.start <= 2200, '窗口宽度不得越过 2200');
  } finally {
    cleanup(w);
  }
});

test('窗口模式 data-source-line 已加偏移（还原为绝对行号，C4/C10）', async () => {
  const { w } = await buildEnv();
  const ed = await waitForEditor(w);
  loadUnifiedRenderer(w);
  try {
    ed.viewMode = 'preview';
    ed.cm.setValue(largeDoc());
    await ed.updatePreview();
    const win = w.editor.previewWindow;
    const block = w.editor.preview.querySelector('.pv-block');
    assert.ok(block, '应有 .pv-block');
    const lines = [...block.querySelectorAll('[data-source-line]')]
      .map((el) => parseInt(el.dataset.sourceLine, 10))
      .filter((n) => !isNaN(n));
    assert.ok(lines.length > 0, '窗口内容应带 data-source-line');
    // 窗口起点 win.start 对应的源码行应被还原为绝对行号（偏移量 = win.start）
    const minLine = Math.min(...lines);
    assert.ok(minLine >= win.start, `最小 data-source-line(${minLine}) 应 >= 窗口起点(${win.start})（偏移已加）`);
  } finally {
    cleanup(w);
  }
});

test('processImages 抛错时后续 PreviewPost 仍执行（C10 健壮性）', async () => {
  const { w } = await buildEnv();
  const ed = await waitForEditor(w);
  loadUnifiedRenderer(w);
  try {
    let headingsRan = false;
    w.PreviewPost.processHeadings = function () { headingsRan = true; };
    // processImages 故意抛错，模拟图片处理失败
    ed.processImages = async function () { throw new Error('image boom'); };
    ed.cm.setValue('# 标题\n\n正文，包含 ![img](missing.png) 图片。');
    await ed.updatePreview(); // 不应 reject
    assert.ok(headingsRan, 'processImages 抛错后，PreviewPost.processHeadings 仍应执行');
    const html = w.editor.preview.innerHTML;
    assert.ok(html.includes('标题'), '预览内容应正常落盘');
  } finally {
    cleanup(w);
  }
});
