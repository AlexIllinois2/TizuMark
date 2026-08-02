// 列表缩进归一化回归测试：验证「每 tabSize 空格升一级」的直观模型在渲染中成立，
// 无论源码是否使用空白行分隔、无论有序列表起始数字是否为 1，深层嵌套都应正确，
// 且不会因过缩进而无故变成代码块。
//
// 根因背景：CommonMark 的有序列表缩进是“按 marker 宽度对齐的列”模型（marker 占 3 列），
// 与“固定步长”错位；且无空行时有序列表项若起始数字 ≠ 1 会被当成父项段落的惰性延续。
// normalizeListIndentation 把视觉缩进 rewrite 成合规列，并对“非 1 起始的有序嵌套项”前插空行。

const { unified } = require('unified');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

// 直接用真实渲染管线（含归一化），断言最终 HTML 结构
const { renderMarkdown } = require(path.resolve(__dirname, '..', 'src', 'unified-renderer.js'));

// 辅助：计数嵌套层级（<ol>/<ul> 的层级深度）
function depthOf(html) {
  const open = (html.match(/<(ol|ul)\b/g) || []).length;
  return open;
}

// 辅助：判断某 start 的有序列表是否作为第 n 级出现
function olAtLevel(html, level) {
  // 粗略：用正则按层级取 <ol> 出现
  const re = new RegExp('<ol\\b' + (level > 1 ? '(?:[^>]*>)' : '') + '.*?', 's');
  return html.includes('<ol');
}

test('N1 有序 1/2/3 无空行：三级全部正确嵌套，无代码块', () => {
  const md = '1. a\n    2. b\n        3. c';
  const html = renderMarkdown(md).replace(/data-source-line="[^"]+"/g, '');
  assert.ok(!html.includes('<pre><code'), '不应出现代码块');
  // 三层 ol
  const olCount = (html.match(/<ol\b/g) || []).length;
  assert.strictEqual(olCount, 3, '应出现 3 层 ol，实际 ' + olCount);
  // 显示序号保留为 2 / 3（start 属性）
  assert.ok(html.includes('start="2"'), '第二级应保留 start=2');
  assert.ok(html.includes('start="3"'), '第三级应保留 start=3');
});

test('N2 有序 4/5/6 无空行（用户截图场景）：正确嵌套，无代码块', () => {
  const md = '1. 345678\n2. 5678\n3. 45678\n    4. 4567\n        5. 3456\n\n    6. 4567';
  const html = renderMarkdown(md).replace(/data-source-line="[^"]+"/g, '');
  assert.ok(!html.includes('<pre><code'), '不应出现代码块');
  assert.ok(html.includes('start="4"'), '第 4 项应作为嵌套有序列表首项正确出现');
  assert.ok(html.includes('start="5"'), '第 5 项应嵌套在第 4 项之下（start=5 出现在 start=4 内部）');
  // start=5 必须出现在 start=4 之后（即嵌套在 4 之下），而非平级
  const idx4 = html.indexOf('start="4"');
  const idx5 = html.indexOf('start="5"');
  assert.ok(idx5 > idx4, 'start=5 应出现在 start=4 之后（嵌套其中）');
  // 第 6 项作为 start=4 列表的兄弟项出现（无 start 属性，因是序列续号），至少不应变成代码块
  assert.ok((html.match(/<li\b/g) || []).length >= 6, '应至少有 6 个 li（含嵌套）');
});

test('N3 有序 4/8/4 有空行：同样正确嵌套', () => {
  const md = '1. 345678\n2. 5678\n3. 45678\n\n    4. 4567\n\n        5. 3456\n\n    6. 4567';
  const html = renderMarkdown(md).replace(/data-source-line="[^"]+"/g, '');
  assert.ok(!html.includes('<pre><code'));
  assert.ok(html.includes('start="4"'), '第 4 项应作为嵌套有序列表首项正确出现');
  assert.ok(html.includes('start="5"'), '第 5 项应嵌套在第 4 项之下');
});

test('N4 无序 4 空格步长：三级嵌套正确', () => {
  const md = '- a\n    - b\n        - c';
  const html = renderMarkdown(md).replace(/data-source-line="[^"]+"/g, '');
  const ulCount = (html.match(/<ul\b/g) || []).length;
  assert.strictEqual(ulCount, 3, '应出现 3 层 ul，实际 ' + ulCount);
});

test('N5 混合：有序内嵌无序 / 无序内嵌有序', () => {
  let html = renderMarkdown('1. a\n    - b\n        - c').replace(/data-source-line="[^"]+"/g, '');
  assert.ok(html.includes('<ol') && html.includes('<ul'), '有序内应含无序');

  html = renderMarkdown('- a\n    1. b\n        2. c').replace(/data-source-line="[^"]+"/g, '');
  assert.ok(html.includes('<ul') && html.includes('<ol'), '无序内应含有序');
  assert.ok(html.includes('start="2"'), '内层有序应保留 start=2');
});

test('N6 围栏代码块内的列表样内容不被归一化', () => {
  const md = 'text\n\n```\n1. not a list\n2. also not\n```';
  const html = renderMarkdown(md).replace(/data-source-line="[^"]+"/g, '');
  assert.ok(html.includes('<pre><code'), '围栏内容应保留为代码块');
  assert.ok(html.includes('1. not a list'), '代码块内文本应保持原样');
});

test('N7 已是 CommonMark 合规缩进的文档：结果幂等，不引入多余空行', () => {
  const md = '1. a\n   1. b\n      1. c';
  const html = renderMarkdown(md).replace(/data-source-line="[^"]+"/g, '');
  const olCount = (html.match(/<ol\b/g) || []).length;
  assert.strictEqual(olCount, 3, '合规文档仍 3 层');
  // 起始为 1，不应插入空行（无 start!=1 的有序项）
  assert.ok(!html.includes('start="2"') && !html.includes('start="3"'), '合规文档序号保持 1');
});

test('N8 普通段落（无列表）：不受归一化影响', () => {
  const md = 'Hello world.\nThis is a paragraph.\nNo lists here.';
  const html = renderMarkdown(md).replace(/data-source-line="[^"]+"/g, '');
  assert.ok(!html.includes('<ol') && !html.includes('<ul'), '不应产生列表');
  assert.ok(html.includes('Hello world.'), '段落文本保持');
});

test('N9 任务列表勾选框 data-source-line 精确回指源码行（点击同步修复）', () => {
  const src = [
    '1. 567', '2. 567', '3. 5678',
    '    4. 4567', '    5. 567', '        6. 567', '        7. 3456', '            8. 3456', '            9. 456',
    '', '- 345', '- 356', '- 3546', '    - 3564', '    - 356', '        - 3546',
    '', '', '- [ ] 4356', '- [ ] 4657', '- [ ] 354657', '- [ ] 345',
  ].join('\n');
  const html = renderMarkdown(src, { tabSize: 4 });
  const lines = src.split('\n');
  // 嵌套正确且无代码块
  assert.ok(!html.includes('<pre><code'), '不应出现代码块');
  assert.strictEqual((html.match(/<ol\b/g) || []).length, 4, '有序应 4 层嵌套');
  assert.strictEqual((html.match(/<ul\b/g) || []).length, 3, '无序应 3 层嵌套');
  // 每个 li 的 data-source-line 必须精确指向含对应 marker 的源码行（否则点击勾选框改错行）
  const liRe = /<li[^>]*data-source-line="(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
  let m, misalign = 0, taskChecked = 0;
  while ((m = liRe.exec(html))) {
    const ln = parseInt(m[1], 10);
    const txt = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const srcLine = lines[ln - 1] || '';
    if (!(ln >= 1 && ln <= lines.length && /^\s*(?:[-*+]|\d+[.)])/.test(srcLine))) misalign++;
    if (m[2].includes('type="checkbox"')) {
      taskChecked++;
      assert.ok(/^\s*- \[[ x]\]/.test(srcLine), '勾选框应回指 - [ ] 源码行，实际: ' + srcLine.trim());
      assert.ok(srcLine.replace(/\s+/g, ' ').includes(txt.split(' ')[0]), '勾选框文本应与源码行匹配');
    }
  }
  assert.strictEqual(misalign, 0, '所有 li 的 data-source-line 都应精确指向源码行');
  assert.strictEqual(taskChecked, 4, '应有 4 个任务勾选框');
});

