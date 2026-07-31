// 上下文菜单测试：showContextMenu 显示定位 / hideAllContextMenus / executeMenuAction 编辑类动作
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor() {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  // 同步 clipboard stub，避免 microtask 时序问题
  w.navigator.clipboard = {
    writeText: (t) => { w.__clip = t; },
    readText: async () => '',
  };
  return { w, ed: w.editor };
}

test('contextmenu: showContextMenu 显示指定菜单并定位', async () => {
  const { w, ed } = await makeEditor();
  try {
    const menu = w.document.createElement('div');
    menu.id = 'editor-context-menu';
    menu.className = 'context-menu hidden';
    w.document.body.appendChild(menu);
    ed.showContextMenu('editor-context-menu', 10, 20);
    assert.ok(!menu.classList.contains('hidden'), '菜单应显示');
    assert.strictEqual(menu.style.left, '10px');
    assert.strictEqual(menu.style.top, '20px');
  } finally { cleanup(w); }
});

test('contextmenu: hideAllContextMenus 隐藏全部菜单', async () => {
  const { w, ed } = await makeEditor();
  try {
    const m1 = w.document.createElement('div'); m1.className = 'context-menu'; m1.id = 'm1';
    const m2 = w.document.createElement('div'); m2.className = 'context-menu'; m2.id = 'm2';
    w.document.body.appendChild(m1); w.document.body.appendChild(m2);
    ed.hideAllContextMenus();
    assert.ok(m1.classList.contains('hidden'));
    assert.ok(m2.classList.contains('hidden'));
  } finally { cleanup(w); }
});

test('contextmenu: executeMenuAction(copy) 复制选区到剪贴板', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('Hello World');
    ed.cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
    ed.executeMenuAction('copy');
    assert.strictEqual(w.__clip, 'Hello', '选区应写入剪贴板');
  } finally { cleanup(w); }
});

test('contextmenu: executeMenuAction(cut) 删除选区', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('Hello World');
    ed.cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
    ed.executeMenuAction('cut');
    assert.strictEqual(ed.cm.getValue(), ' World', '选区应被剪切');
    assert.strictEqual(w.__clip, 'Hello');
  } finally { cleanup(w); }
});

test('contextmenu: executeMenuAction(select-all) 全选编辑器内容', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.cm.setValue('abc');
    ed.executeMenuAction('select-all');
    assert.ok(ed.cm.somethingSelected(), '应全选');
  } finally { cleanup(w); }
});
