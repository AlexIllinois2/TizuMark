// 表格行内 Enter 自动补充结构测试
// 测试 _handleTableEnter 方法的各种场景
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor(initialContent) {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  if (initialContent) ed.cm.setValue(initialContent);
  return { w, ed };
}

function content(ed) {
  return ed.cm.getValue();
}

test('table-enter: 光标在表格行尾按 Enter 插入等列新行（3 列）', async () => {
  const { w, ed } = await makeEditor('| a | b | c |');
  try {
    // 光标定位到行尾
    ed.cm.setCursor({ line: 0, ch: 13 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 2, '应生成 2 行');
    assert.strictEqual(lines[0], '| a | b | c |', '第一行内容不变');
    // 第二行应为 |   |   |   |（3 列，格子间空格）
    assert.ok(lines[1].startsWith('|'), '第二行应以 | 开头');
    const cols = lines[1].split('|').length - 2; // 去掉首尾空
    assert.strictEqual(cols, 3, '第二行应是 3 列');
    // 光标应在第二行第 2 格
    const cursor = ed.cm.getCursor();
    assert.strictEqual(cursor.line, 1, '光标应在第 2 行');
    assert.strictEqual(cursor.ch, 2, '光标应在第 2 列');
  } finally { cleanup(w); }
});

test('table-enter: 4 列表格行按 Enter 生成 4 列', async () => {
  const { w, ed } = await makeEditor('| h1 | h2 | h3 | h4 |');
  try {
    ed.cm.setCursor({ line: 0, ch: 19 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    const cols = lines[1].split('|').length - 2;
    assert.strictEqual(cols, 4, '4 列表格应生成 4 列新行');
  } finally { cleanup(w); }
});

test('table-enter: 空表格行按 Enter 退出表格（删除行）', async () => {
  const { w, ed } = await makeEditor('|   |   |   |');
  try {
    ed.cm.setCursor({ line: 0, ch: 13 });
    ed._handleTableEnter(ed.cm);
    // 空行应被删除，文件应为空
    assert.strictEqual(content(ed), '', '空表格行应按 Enter 删除');
  } finally { cleanup(w); }
});

test('table-enter: 空表格行在非最后一行时退出保留后续行', async () => {
  const { w, ed } = await makeEditor('| a | b |\n|   |   |\n| c | d |');
  try {
    ed.cm.setCursor({ line: 1, ch: 8 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 2, '中间空行删除后应剩 2 行');
    assert.strictEqual(lines[0], '| a | b |', '第一行不变');
    assert.strictEqual(lines[1], '| c | d |', '第三行上移');
  } finally { cleanup(w); }
});

test('table-enter: 分隔行按 Enter 不生成表格结构（走正常列表延续/换行）', async () => {
  const { w, ed } = await makeEditor('|---|---|---|');
  try {
    // 光标置于行尾，使 newlineAndIndent 在行尾换行
    const lineLen = ed.cm.getLine(0).length;
    ed.cm.setCursor({ line: 0, ch: lineLen });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    // 分隔行应视为非表格行，只做普通换行 - 不创建表格列
    assert.strictEqual(lines.length, 2, '分隔行 Enter 应产生 2 行（普通换行）');
    assert.strictEqual(lines[0], '|---|---|---|', '分隔行不变');
    assert.strictEqual(lines[1], '', '第二行应为空');
  } finally { cleanup(w); }
});

test('table-enter: 无序列表行按 Enter 延续列表结构', async () => {
  const { w, ed } = await makeEditor('- item');
  try {
    const lineLen = ed.cm.getLine(0).length;
    ed.cm.setCursor({ line: 0, ch: lineLen });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 2, '列表行 Enter 应产生 2 行');
    assert.strictEqual(lines[0], '- item', '原行不变');
    assert.strictEqual(lines[1], '', '第二行应为普通空行（测试环境无 continuelsit 插件）');
  } finally { cleanup(w); }
});

test('table-enter: 光标在中间时仍生成完整新行', async () => {
  const { w, ed } = await makeEditor('| a | b | c |');
  try {
    // 光标在第一个格中间
    ed.cm.setCursor({ line: 0, ch: 3 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 2, '应生成 2 行');
    assert.ok(lines[0].startsWith('|'), '第一行仍以 | 开头');
    const cols = lines[1].split('|').length - 2;
    assert.strictEqual(cols, 3, '第二行应是 3 列');
  } finally { cleanup(w); }
});
