// 渲染补充块测试：GitHub 风格 Alert（[!NOTE] 等）、任务列表 checkbox 双向切换、
// 本地图片路径保留 data-source-line 等
const test = require('node:test');
const assert = require('node:assert');
const { renderMarkdown } = require('../src/unified-renderer.js');
const { buildEnv, cleanup, delay, waitForEditor } = require('./helpers/app-env.cjs');

// ---------- Alert 块 ----------

test('render-extra: [!NOTE] 渲染为 alert-note 结构', async () => {
  const html = renderMarkdown('> [!NOTE]\n> 这是提示内容', { softBreaks: false });
  assert.ok(html.includes('class="alert alert-note"'), '应有 alert-note 容器');
  assert.ok(html.includes('alert-title'), '应有标题栏');
  assert.ok(html.includes('alert-content'), '应有内容区');
  assert.ok(html.includes('这是提示内容'));
});

test('render-extra: 五种 alert 类型均可渲染', async () => {
  for (const t of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
    const html = renderMarkdown(`> [!${t}]\n> 内容X`, { softBreaks: false });
    assert.ok(html.includes(`alert-${t.toLowerCase()}`), `[!${t}] 应渲染 alert-${t.toLowerCase()}`);
    assert.ok(html.includes('内容X'));
  }
});

test('render-extra: alert 自定义标题', async () => {
  const html = renderMarkdown('> [!WARNING] 自定义警告标题\n> 内容', { softBreaks: false });
  assert.ok(html.includes('自定义警告标题'), '应显示自定义标题');
});

test('render-extra: alert 内容支持内联 markdown', async () => {
  const html = renderMarkdown('> [!TIP]\n> 有 **加粗** 和 `代码`', { softBreaks: false });
  assert.ok(/<strong[^>]*>加粗<\/strong>/.test(html), 'alert 内加粗应渲染');
  assert.ok(/<code[^>]*>代码<\/code>/.test(html), 'alert 内行内码应渲染');
});

test('render-extra: 代码块内 [!NOTE] 不转换', async () => {
  const html = renderMarkdown('```\n> [!NOTE]\n> 不是提示\n```', { softBreaks: false });
  assert.ok(!html.includes('alert-note'), '代码块内不应转 alert');
  assert.ok(html.includes('[!NOTE]'), '原文应保留在代码块内');
});

test('render-extra: 普通引用块不受 alert 转换影响', async () => {
  const html = renderMarkdown('> 普通引用内容', { softBreaks: false });
  assert.ok(html.includes('<blockquote'), '应仍为 blockquote');
  assert.ok(!html.includes('class="alert'), '不应误转为 alert');
});

// ---------- 任务列表 checkbox 双向切换 ----------

async function makeEditor() {
  const { w } = await buildEnv({ captureInitErr: true });
  const ed = await waitForEditor(w);
  return { w, ed };
}

function fakeCheckbox(w, sourceLine, checked) {
  const li = w.document.createElement('li');
  li.setAttribute('data-source-line', String(sourceLine)); // 1-based
  const cb = w.document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked; // click 后浏览器已切换的状态
  li.appendChild(cb);
  w.document.body.appendChild(li);
  return cb;
}

test('render-extra: 任务 checkbox 勾选写回 [x]', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('- [ ] 待办一\n- [ ] 待办二');
    const cb = fakeCheckbox(w, 1, true);
    ed.handleTaskCheckboxToggle(cb);
    assert.strictEqual(ed.cm.getLine(0), '- [x] 待办一');
    assert.strictEqual(ed.cm.getLine(1), '- [ ] 待办二', '其他行不受影响');
  } finally { cleanup(w); }
});

test('render-extra: 任务 checkbox 取消勾选写回 [ ]', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('- [x] 已完成');
    const cb = fakeCheckbox(w, 1, false);
    ed.handleTaskCheckboxToggle(cb);
    assert.strictEqual(ed.cm.getLine(0), '- [ ] 已完成');
  } finally { cleanup(w); }
});

test('render-extra: 引用块嵌套与有序列表任务行也可切换', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('> - [ ] 引用内任务\n1. [ ] 有序任务');
    ed.handleTaskCheckboxToggle(fakeCheckbox(w, 1, true));
    ed.handleTaskCheckboxToggle(fakeCheckbox(w, 2, true));
    assert.strictEqual(ed.cm.getLine(0), '> - [x] 引用内任务');
    assert.strictEqual(ed.cm.getLine(1), '1. [x] 有序任务');
  } finally { cleanup(w); }
});

test('render-extra: 非任务行 / 无 data-source-line 时安全跳过', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('普通文本行');
    ed.handleTaskCheckboxToggle(fakeCheckbox(w, 1, true));
    assert.strictEqual(ed.cm.getLine(0), '普通文本行', '非任务行不应被改');
    // 无 li 包裹
    const bare = w.document.createElement('input');
    bare.type = 'checkbox';
    w.document.body.appendChild(bare);
    ed.handleTaskCheckboxToggle(bare); // 不应抛错
    // 行号越界
    ed.handleTaskCheckboxToggle(fakeCheckbox(w, 99, true));
    assert.strictEqual(ed.cm.getLine(0), '普通文本行');
  } finally { cleanup(w); }
});

// ---------- 渲染产物中的任务列表结构 ----------

test('render-extra: 任务列表渲染带 data-source-line（toggle 反查依据）', async () => {
  const html = renderMarkdown('- [ ] 任务A\n- [x] 任务B', { softBreaks: false });
  assert.ok(html.includes('type="checkbox"'), '应有 checkbox');
  assert.ok(/<li[^>]*data-source-line="1"/.test(html), 'li 应标注 1-based 源行号');
  assert.ok(/<li[^>]*data-source-line="2"/.test(html));
  assert.ok(/checked/.test(html), '已完成任务应勾选');
});

// ---------- 图片渲染 ----------

test('render-extra: 本地相对路径图片保留原 src 供后处理替换', async () => {
  const html = renderMarkdown('![截图](assets/pic.png)', { softBreaks: false });
  assert.ok(/<img[^>]*src="assets\/pic\.png"/.test(html), '相对路径应保留在 src');
  assert.ok(/alt="截图"/.test(html));
});

test('render-extra: 网络图片与带标题图片', async () => {
  const html = renderMarkdown('![网](https://a.com/b.png "说明")', { softBreaks: false });
  assert.ok(/<img[^>]*src="https:\/\/a\.com\/b\.png"/.test(html));
  assert.ok(/title="说明"/.test(html));
});
