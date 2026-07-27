// 渲染补充块测试：GitHub 风格 Alert（[!NOTE] 等）、任务列表 checkbox 双向切换、
// 本地图片路径保留 data-source-line 等
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { renderMarkdown } = require('../src/unified-renderer.js');
const { buildEnv, cleanup, delay, waitForEditor } = require('./helpers/app-env.cjs');

// 浏览器里 unified-bundle.js 以 <script> 挂全局 UnifiedRenderer；jsdom 测试需手动 eval，
// 否则 updatePreview 内 UnifiedRenderer.renderMarkdown 抛错、preview 渲染失败（无 checkbox）。
// 之前“勾选”测试用游离 fakeCheckbox 绕过了真实预览渲染，漏掉了防抖重建覆盖这类真实 bug。
const _bundle = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/unified-bundle.js'), 'utf8');
function loadUnifiedRenderer(w) {
  w.eval(_bundle.replace('var UnifiedRenderer =', 'window.UnifiedRenderer ='));
}

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
  loadUnifiedRenderer(w);
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

// ---------- 任务列表勾选：即时同步 DOM 且抑制全量重渲染（根治卡顿 + 跳动） ----------
test('render-extra: 勾选任务列表即时同步 DOM 且抑制全量重渲染（不卡不跳）', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('- [ ] 待办一\n- [ ] 待办二');
    // spy：记录全量 updatePreview（markdown 重解析 + 语法高亮 + innerHTML 替换）是否被调用
    let fullPreviewCalls = 0;
    const origUpdate = ed.updatePreview.bind(ed);
    ed.updatePreview = async (...a) => { fullPreviewCalls++; return origUpdate(...a); };
    const cb = fakeCheckbox(w, 1, false); // 旧态未勾选
    ed.handleTaskCheckboxToggle(cb);
    assert.strictEqual(cb.checked, true, '预览 checkbox 应即时被勾上（不依赖重渲染）');
    assert.strictEqual(ed.cm.getLine(0), '- [x] 待办一', '源码应写回 [x]');
    assert.strictEqual(ed.cm.getLine(1), '- [ ] 待办二', '其他行不受影响');
    assert.strictEqual(ed._suppressNextPreviewRerender, false, '抑制标记应被 debounceUpdatePreview 立即消费');
    assert.strictEqual(fullPreviewCalls, 0, '不应触发全量预览重渲染（避免卡顿 + 滚动跳动）');
  } finally { cleanup(w); }
});

test('render-extra: 取消勾选同样即时同步且抑制重渲染', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('- [x] 已完成');
    let fullPreviewCalls = 0;
    const origUpdate = ed.updatePreview.bind(ed);
    ed.updatePreview = async (...a) => { fullPreviewCalls++; return origUpdate(...a); };
    const cb = fakeCheckbox(w, 1, true);
    ed.handleTaskCheckboxToggle(cb);
    assert.strictEqual(cb.checked, false, '预览 checkbox 应即时取消勾选');
    assert.strictEqual(ed.cm.getLine(0), '- [ ] 已完成', '源码应写回 [ ]');
    assert.strictEqual(fullPreviewCalls, 0, '不应触发全量预览重渲染');
  } finally { cleanup(w); }
});

// ---------- 任务列表勾选：防抖遗留定时器不能整篇重建 preview（根治“看似没反应/跳动”） ----------
test('render-extra: 勾选后预览不被遗留防抖定时器整篇重建（即时勾选保持）', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('- [ ] 任务一\n- [ ] 任务二');
    await ed.updatePreview();
    // 模拟用户此前打字：安排一个 300ms 防抖重建（setValue 之后遗留的待执行定时器）
    ed.cm.replaceRange('x', { line: 1, ch: 0 });
    await delay(50); // 故意 <300ms，让定时器处于“待执行”状态
    const realCb = ed.preview.querySelector('input[type="checkbox"]');
    assert.ok(realCb, 'preview 应渲染出真实 checkbox');
    // 还原误加字符，仍是任务列表结构（再触发一次 debounce，定时器依旧待执行）
    ed.cm.replaceRange('', { line: 1, ch: 0 }, { line: 1, ch: 1 });
    // 勾选（走真实 handleTaskCheckboxToggle 路径）
    ed.handleTaskCheckboxToggle(realCb);
    assert.strictEqual(realCb.checked, true, '勾选应即时生效');
    assert.strictEqual(ed.cm.getLine(0), '- [x] 任务一', '源码应写回 [x]');
    // 越过 300ms 防抖窗口：若未取消遗留定时器，preview 会被整篇重建并覆盖即时勾选
    await delay(400);
    const afterCb = ed.preview.querySelector('input[type="checkbox"]');
    assert.strictEqual(afterCb, realCb, 'preview 不应被整篇重建（否则即时勾选被覆盖/跳动）');
    assert.strictEqual(afterCb.checked, true, '勾选状态在防抖窗口后应保持');
    assert.strictEqual(ed.cm.getLine(0), '- [x] 任务一', '源码应仍为 [x]');
  } finally { cleanup(w); }
});

// ---------- 任务列表勾选：真实点击经事件委托（preventDefault 回归锁，必须用真实渲染） ----------
// 注：此前用例直接调用 handleTaskCheckboxToggle，绕过了 initExternalLinks 的 click 委托，
// 无法捕获「preventDefault 撤销原生切换」这类回归。此处用真实 click 触发完整事件路径。
test('render-extra: 真实点击预览 checkbox 经事件委托勾上（preventDefault 回归锁）', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('- [ ] 待办一\n- [ ] 待办二');
    await ed.updatePreview(); // 真实渲染：unified-bundle 已 eval 到 window.UnifiedRenderer
    const cb = ed.preview.querySelector('input[type="checkbox"]');
    assert.ok(cb, 'preview 应渲染出真实 checkbox 元素');
    assert.strictEqual(cb.checked, false, '初始应未勾选');
    // 真实 click：事件冒泡到 initExternalLinks 挂在 preview 上的 click 委托。
    // 若那里恢复 e.preventDefault()，原生切换会在事件派发后被撤销，cb.checked 回退为 false —— 正是历史 bug。
    cb.click();
    await delay(30); // 等异步委托监听器跑完 handleTaskCheckboxToggle
    assert.strictEqual(cb.checked, true, '真实点击后 checkbox 应被原生切换勾上（preventDefault 会撤销它）');
    assert.strictEqual(ed.cm.getLine(0), '- [x] 待办一', '源码应写回 [x]');
    // 越过防抖窗口：preview 不应被整篇重建，即时勾选保持
    await delay(400);
    const afterCb = ed.preview.querySelector('input[type="checkbox"]');
    assert.strictEqual(afterCb, cb, 'preview 不应被整篇重建（否则即时勾选被覆盖/跳动）');
    assert.strictEqual(afterCb.checked, true, '防抖窗口后勾选状态应保持');
  } finally { cleanup(w); }
});

test('render-extra: 真实点击已勾选的 checkbox 经事件委托取消勾选', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('- [x] 已完成');
    await ed.updatePreview();
    const cb = ed.preview.querySelector('input[type="checkbox"]');
    assert.ok(cb, 'preview 应渲染出真实 checkbox 元素');
    assert.strictEqual(cb.checked, true, '初始应已勾选');
    cb.click();
    await delay(30);
    assert.strictEqual(cb.checked, false, '真实点击后 checkbox 应被原生切换取消勾选');
    assert.strictEqual(ed.cm.getLine(0), '- [ ] 已完成', '源码应写回 [ ]');
  } finally { cleanup(w); }
});

// ---------- CSS：代码块内层不应有第二层灰底/边框 ----------
test('render-extra: 预览代码块内的 code 元素透明无边框（无论有无 hljs 类）', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'src/styles.css'), 'utf8');
  // 必须存在一条针对代码块内 code 的规则（不要依赖 .hljs 后缀），压住 .preview-content code 行内规则
  const ruleMatch = css.match(/\.preview-content\s+pre\s+code\b[^{]*\{[^}]*\}/);
  assert.ok(ruleMatch, 'styles.css 必须包含 `.preview-content pre code` 规则（不限 hljs 类）');
  const rule = ruleMatch[0];
  assert.ok(/background\s*:\s*(transparent|none)/i.test(rule),
    '该规则必须把 code 背景设为透明/无，避免显示 hljs 主题白底或第二层灰底');
  assert.ok(/border\s*:\s*none/i.test(rule),
    '该规则必须显式 border:none，不能依赖 .preview-content code 的边框而漏设');
  // 同时确保 .preview-content code（行内）规则仍存在，保留段落内行内 code 的灰底+边框
  assert.ok(/\.preview-content\s+code\s*\{[^}]*var\(--code-bg\)/.test(css),
    '行内 code 的灰底规则（.preview-content code + var(--code-bg)）必须保留');
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
