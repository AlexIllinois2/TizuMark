// 格式工具栏测试：通过真实 executeMenuAction 分发，覆盖行内格式 / 标题 / 块插入 / 列表 / 链接图片对话框
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor() {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  return { w, ed: w.editor };
}

function setContent(ed, text) {
  ed.cm.setValue(text);
}

test('format: 行内格式 wrapSelection（粗/斜/删除线/行内代码/高亮/上下标）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const cases = [
      ['insert-bold', '**', '**'],
      ['insert-italic', '*', '*'],
      ['insert-strikethrough', '~~', '~~'],
      ['insert-inline-code', '`', '`'],
      ['insert-highlight', '==', '=='],
      ['insert-superscript', '<sup>', '</sup>'],
      ['insert-subscript', '<sub>', '</sub>'],
    ];
    for (const [action, before, after] of cases) {
      setContent(ed, 'Hello');
      ed.cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
      ed.executeMenuAction(action);
      assert.strictEqual(ed.cm.getValue(), before + 'Hello' + after, `${action} 应包裹选中文本`);
    }
  } finally { cleanup(w); }
});

test('format: 无选中 bold 插入占位并定位光标到中间', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-bold');
    assert.strictEqual(ed.cm.getValue(), '****', '无选中应插入 **** 占位');
    const cur = ed.cm.getCursor();
    assert.strictEqual(cur.ch, 2, '光标应定位到 ** 之间');
  } finally { cleanup(w); }
});

test('format: 标题 H1-H6 在行首加 # 前缀', async () => {
  const { w, ed } = await makeEditor();
  try {
    const map = [['insert-h1', '# '], ['insert-h2', '## '], ['insert-h3', '### '], ['insert-h4', '#### '], ['insert-h5', '##### '], ['insert-h6', '###### ']];
    for (const [action, prefix] of map) {
      setContent(ed, '标题');
      ed.cm.setCursor({ line: 0, ch: 0 });
      ed.executeMenuAction(action);
      assert.strictEqual(ed.cm.getValue(), prefix + '标题', `${action} 应生成「${prefix}标题」`);
    }
  } finally { cleanup(w); }
});

test('format: 块插入 代码块/表格/引用/数学/Mermaid/分隔线/TOC/callout', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 代码块
    setContent(ed, '');
    ed.executeMenuAction('insert-code-block');
    assert.ok(ed.cm.getValue().includes('```javascript'), '应插入 javascript 代码块');

    // 表格
    setContent(ed, '');
    ed.executeMenuAction('insert-table');
    assert.ok(ed.cm.getValue().includes('| 列1 | 列2 | 列3 |'), '应插入三列表格');

    // 引用
    setContent(ed, '');
    ed.executeMenuAction('insert-quote');
    assert.ok(ed.cm.getValue().includes('> '), '应插入引用前缀');

    // 数学块
    setContent(ed, '');
    ed.executeMenuAction('insert-math-block');
    assert.ok(ed.cm.getValue().includes('$$'), '应插入 $$ 数学块');

    // Mermaid
    setContent(ed, '');
    ed.executeMenuAction('insert-mermaid');
    assert.ok(ed.cm.getValue().includes('```mermaid'), '应插入 mermaid 代码块');

    // 分隔线
    setContent(ed, '');
    ed.executeMenuAction('insert-hr');
    assert.ok(ed.cm.getValue().includes('---'), '应插入分隔线');

    // TOC
    setContent(ed, '');
    ed.executeMenuAction('insert-toc');
    assert.ok(ed.cm.getValue().includes('[TOC]'), '应插入 [TOC]');

    // callout
    setContent(ed, '');
    ed.executeMenuAction('insert-callout-note');
    assert.ok(ed.cm.getValue().includes('> [!NOTE]'), '应插入 NOTE callout');
  } finally { cleanup(w); }
});

test('format: 列表 无序/有序/任务', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '项目');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-ul');
    assert.strictEqual(ed.cm.getValue(), '- 项目', '无序列表应加 - 前缀');

    setContent(ed, '项目');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-ol');
    assert.strictEqual(ed.cm.getValue(), '1. 项目', '有序列表应加 1. 前缀');

    setContent(ed, '项目');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-task');
    assert.strictEqual(ed.cm.getValue(), '- [ ] 项目', '任务列表应加 - [ ] 前缀');
  } finally { cleanup(w); }
});

test('format: 链接对话框显示并填入当前选区', async () => {
  const { w, ed } = await makeEditor();
  try {
    for (const id of ['insert-link-text', 'insert-link-url', 'insert-link-dialog']) {
      if (!w.document.getElementById(id)) {
        const el = w.document.createElement('input'); el.id = id; w.document.body.appendChild(el);
      }
    }
    setContent(ed, '示例文字');
    ed.cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 4 });
    ed.executeMenuAction('insert-link');
    const dialog = w.document.getElementById('insert-link-dialog');
    assert.ok(!dialog.classList.contains('hidden'), '链接对话框应显示');
    assert.strictEqual(w.document.getElementById('insert-link-text').value, '示例文字', '选区应填入链接文本');
  } finally { cleanup(w); }
});

test('format: 图片 web 路径 OK 插入 ![alt](url)', async () => {
  const { w, ed } = await makeEditor();
  try {
    for (const id of ['insert-image-alt', 'insert-image-url', 'insert-image-local-field', 'insert-image-dialog']) {
      if (!w.document.getElementById(id)) {
        const el = w.document.createElement('input'); el.id = id; w.document.body.appendChild(el);
      }
    }
    w.document.getElementById('insert-image-local-field').classList.add('hidden'); // 模拟 web 来源
    w.document.getElementById('insert-image-alt').value = 'pic';
    w.document.getElementById('insert-image-url').value = 'https://x.com/a.png';
    ed.settings.imageInsertMode = 'url'; // web 分支不检查 filePath
    await ed.handleInsertImageOk();
    assert.ok(ed.cm.getValue().includes('![pic](https://x.com/a.png)'), 'web 图片应插入 markdown 图片语法');
    assert.ok(w.document.getElementById('insert-image-dialog').classList.contains('hidden'), '确认后对话框应关闭');
  } finally { cleanup(w); }
});

test('format: 点击格式工具栏下拉项后菜单强制隐藏，鼠标移出后恢复', async () => {
  const { w, ed } = await makeEditor();
  try {
    const item = w.document.querySelector('#format-toolbar .fmt-dropdown .dropdown-item[data-action="insert-table"]');
    assert.ok(item, '应存在 结构插入→表格 菜单项');
    const menu = item.closest('.dropdown-menu');
    const dd = item.closest('.fmt-dropdown');

    // 点击前不应有 force-hide
    assert.ok(!menu.classList.contains('force-hide'), '点击前菜单不应处于 force-hide');

    // 真实派发 click，触发 initFormatToolbar 的点击委托
    item.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(menu.classList.contains('force-hide'), '点击菜单项后菜单应被强制隐藏（force-hide）');

    // 鼠标移出下拉区应清除 force-hide，恢复 hover 展开能力
    dd.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }));
    assert.ok(!menu.classList.contains('force-hide'), '鼠标移出后 force-hide 应被清除');
  } finally { cleanup(w); }
});
