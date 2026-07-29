// Ctrl + 鼠标滚轮缩放编辑器字体测试
// 覆盖：基础放大/缩小/上下限、顶部提示、per-tab 隔离、重置按钮、3 秒消失
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, waitForEditor } = require('./helpers/app-env.cjs');

async function makeEnv() {
  const { w } = await buildEnv({ captureInitErr: true });
  const ed = await waitForEditor(w);
  return { w, ed };
}

// 在编辑器 wrapper 上派发带 ctrlKey / deltaY 的 wheel 事件
// （jsdom 下 WheelEvent 的 ctrlKey/deltaY 为只读，用 defineProperty 注入）
function dispatchWheel(w, wrapper, { ctrlKey, deltaY }) {
  const ev = new w.Event('wheel', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'ctrlKey', { value: ctrlKey, configurable: true });
  Object.defineProperty(ev, 'deltaY', { value: deltaY, configurable: true });
  wrapper.dispatchEvent(ev);
  return ev;
}

test('ctrl+wheel 向上滚动放大编辑器字体 1px 并拦截默认行为', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    const base = ed.settings.fontSize;
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), base, '初始化后字号应等于 settings.fontSize');
    const ev = dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(ev.defaultPrevented, true, 'Ctrl+滚轮应阻止默认（页面/编辑器缩放）');
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), base + 1, '放大后应为基准 +1px');
    assert.strictEqual(ed.activeTab.fontSize, base + 1, '应同时写入当前 tab 的 fontSize');
  } finally { cleanup(w); }
});

test('ctrl+wheel 向下滚动缩小编辑器字体 1px', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    const base = ed.settings.fontSize;
    const ev = dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: 100 });
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), base - 1, '缩小后应为基准 -1px');
    assert.strictEqual(ed.activeTab.fontSize, base - 1);
    assert.strictEqual(ev.defaultPrevented, true);
  } finally { cleanup(w); }
});

test('ctrl+wheel 放大到上限 72px 后不再增大', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    for (let i = 0; i < 100; i++) dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), 72, '应钳制在 72px');
    assert.strictEqual(ed.activeTab.fontSize, 72);
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), 72, '上限处再次放大仍保持 72px');
  } finally { cleanup(w); }
});

test('ctrl+wheel 缩小到下限 8px 后不再减小', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    for (let i = 0; i < 100; i++) dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: 100 });
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), 8, '应钳制在 8px');
    assert.strictEqual(ed.activeTab.fontSize, 8);
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: 100 });
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), 8);
  } finally { cleanup(w); }
});

test('普通滚轮（无 Ctrl）不改变字号且不拦截', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    const before = wrapper.style.fontSize;
    const ev = dispatchWheel(w, wrapper, { ctrlKey: false, deltaY: -100 });
    assert.strictEqual(wrapper.style.fontSize, before, '无 Ctrl 不应改变字号');
    assert.strictEqual(ev.defaultPrevented, false, '无 Ctrl 不应拦截默认滚动');
  } finally { cleanup(w); }
});

test('ctrl+wheel 缩放后顶部居中显示字号提示（含设置字号与重置按钮）', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    const base = ed.settings.fontSize;
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    const hint = ed.zoomHint;
    assert.ok(hint.classList.contains('show'), '顶部提示应可见');
    const textEl = hint.querySelector('.zoom-hint-text');
    assert.strictEqual(textEl.textContent, ed.t('fontSizeHint', { size: base + 1 }), '左侧应显示当前字号');
    const resetEl = hint.querySelector('.zoom-hint-reset');
    assert.ok(!resetEl.classList.contains('hidden'), '偏离设置字号时重置按钮应可见');
    assert.strictEqual(resetEl.textContent, ed.t('fontSizeReset', { base }), '右侧按钮应为「还原 Npx」');
  } finally { cleanup(w); }
});

test('命中设置字号时提示仅显示当前字号、重置按钮隐藏', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    const textEl = ed.zoomHint.querySelector('.zoom-hint-text');
    const resetEl = ed.zoomHint.querySelector('.zoom-hint-reset');
    // 主动调用 resetEditorFontSize，让当前 tab 回到设置字号
    ed.resetEditorFontSize();
    const base = ed.settings.fontSize;
    assert.strictEqual(ed.activeTab.fontSize, base);
    assert.ok(ed.zoomHint.classList.contains('show'));
    assert.strictEqual(textEl.textContent, ed.t('fontSizeHint', { size: base }));
    assert.ok(resetEl.classList.contains('hidden'), '命中设置字号时重置按钮应隐藏');
  } finally { cleanup(w); }
});

test('点击 ⟲ 重置按钮恢复到设置字号', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    const base = ed.settings.fontSize;
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    const resetEl = ed.zoomHint.querySelector('.zoom-hint-reset');
    resetEl.click();
    assert.strictEqual(ed.activeTab.fontSize, base, '字号应回到设置字号');
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), base, 'wrapper 字号应同步');
    const textEl = ed.zoomHint.querySelector('.zoom-hint-text');
    assert.strictEqual(textEl.textContent, ed.t('fontSizeHint', { size: base }));
  } finally { cleanup(w); }
});

test('每标签独立：tabA 缩放后切到 tabB 不影响 tabA', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    const base = ed.settings.fontSize;
    // tab0 缩放
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(ed.activeTab.fontSize, base + 1);
    // 新建 tab2 并切到 tab2
    await ed.addTab('tab2', 'content2', null);
    const newTab = ed.activeTab;
    assert.strictEqual(newTab.fontSize, base, '新 tab 字号默认设置字号');
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), base, 'wrapper 字号应同步为新 tab 的字号');
    // 缩放 tab2
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: 100 });
    assert.strictEqual(newTab.fontSize, base - 1);
    // 切回 tab0
    await ed.switchTab(0);
    assert.strictEqual(ed.activeTab.fontSize, base + 1, 'tab0 字号应保留');
    assert.strictEqual(parseInt(wrapper.style.fontSize, 10), base + 1, 'wrapper 字号应恢复 tab0');
  } finally { cleanup(w); }
});

test('切 tab 时隐藏顶部提示', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    assert.ok(ed.zoomHint.classList.contains('show'), '触发后顶部提示应显示');
    await ed.addTab('tab2', 'content2', null);
    assert.ok(!ed.zoomHint.classList.contains('show'), '切 tab 后顶部提示应隐藏');
  } finally { cleanup(w); }
});

test('停止缩放 3 秒后顶部提示自动消失', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    assert.ok(ed.zoomHint.classList.contains('show'), '触发后顶部提示应显示');
    await new Promise((r) => setTimeout(r, 3100));
    assert.ok(!ed.zoomHint.classList.contains('show'), '3 秒后顶部提示应自动隐藏');
  } finally { cleanup(w); }
});

test('hover 时顶部提示不消失，移出后 3 秒消失', async () => {
  const { w, ed } = await makeEnv();
  try {
    const wrapper = ed.cm.getWrapperElement();
    dispatchWheel(w, wrapper, { ctrlKey: true, deltaY: -100 });
    assert.ok(ed.zoomHint.classList.contains('show'), '触发后顶部提示应显示');
    // 模拟鼠标移入：标记 hovering 并派发 mouseenter
    ed._zoomHintHovering = true;
    ed.zoomHint.dispatchEvent(new w.Event('mouseenter'));
    assert.ok(ed._zoomHintHovering, 'hovering 标志应为真');
    // 即便等过 3 秒也不应消失
    await new Promise((r) => setTimeout(r, 3200));
    assert.ok(ed.zoomHint.classList.contains('show'), 'hover 期间顶部提示应保持显示');
    // 移出：重启 3 秒倒计时
    ed.zoomHint.dispatchEvent(new w.Event('mouseleave'));
    assert.ok(!ed._zoomHintHovering, '移出后 hovering 标志应为假');
    await new Promise((r) => setTimeout(r, 3100));
    assert.ok(!ed.zoomHint.classList.contains('show'), '移出 3 秒后顶部提示应隐藏');
  } finally { cleanup(w); }
});
