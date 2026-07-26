// 回归测试：不成对定界符（$）吞内容 + 孤立 == 高亮丢字符。
// 覆盖 guardMathBlocks 行内/块级分支的 !foundEnd 回退，以及 convertHighlights 的 == 回退。
const test = require('node:test');
const assert = require('node:assert');
const { renderMarkdown } = require('../src/unified-renderer.js');

test('不成对 $ 在表格中不吞内容（用户复现）', async () => {
  const md = [
    '## 测试',
    '',
    '| 项目 | 费用 |',
    '| ---- | ---- |',
    '| 配额 | $12/5h 窗口 |',
    '| 单价 | $0.00038/次 |',
    '',
    '正文里有金额 $12/5h 和 $0.00038/次',
  ].join('\n');
  const html = renderMarkdown(md, { softBreaks: false });
  // 表格仍正常渲染
  assert.ok(html.includes('<table'), '应渲染为 <table>');
  assert.ok((html.match(/<td/g) || []).length === 4, '应有 4 个单元格，不错位');
  // 金额以普通文本原样出现，未被包进 MATHBLOCK 占位符
  assert.ok(html.includes('$12/5h 窗口'), '表格单元格金额应原样显示');
  assert.ok(html.includes('$0.00038/次'), '表格单元格金额应原样显示');
  assert.ok(html.includes('正文里有金额 $12/5h 和 $0.00038/次'), '正文金额应原样显示');
  assert.ok(!html.includes('MATHBLOCK'), '不应生成任何 MATHBLOCK（无成对公式）');
});

test('不成对 $ 不跨表格单元格配对（用户复现 v2）', async () => {
  // 同一行两个不成对 $（不同单元格）不应被当一条公式吞掉中间内容
  const md = [
    '## 测试',
    '',
    '| 项目 | 费用 |',
    '| ---- | ---- |',
    '| 配额 | $12/5h 窗口 |',
    '| 单价 | $0.00038/次 |',
    '',
    '正文里有金额 $$12/5h 和 $$0.00038/次 也会被吞。',
    '',
    '$$ 234322 $$',
  ].join('\n');
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('<table'), '应渲染为 <table>');
  assert.strictEqual((html.match(/<td/g) || []).length, 4, '应有 4 个单元格，不错位');
  assert.ok(html.includes('$12/5h 窗口'), '表格金额应原样显示');
  assert.ok(html.includes('$0.00038/次'), '表格金额应原样显示');
  assert.ok(html.includes('$$12/5h 和 $$0.00038/次'), '正文内联 $$ 应原样显示（不当公式）');
  assert.ok(html.includes('$$ 234322 $$'), '成对 $$...$$ 应保留供 KaTeX 渲染');
  assert.ok(!html.includes('MATHBLOCK'), '不应生成行内 MATHBLOCK');
  assert.ok((html.match(/math-display/g) || []).length === 1, '仅 $$ 234322 $$ 一个块级公式');
});

test('行内 $$ 当字面量，不跨段配对', async () => {
  // 行内的 $$ 不应作为块级公式，也不应与后续 $$ 跨段配对
  const html = renderMarkdown('正文里有金额 $$12/5h 和 $$0.00038/次', { softBreaks: false });
  assert.ok(html.includes('$$12/5h 和 $$0.00038/次'), '行内 $$ 应原样显示');
  assert.ok(!html.includes('math-display'), '行内 $$ 不应生成块级公式占位');
  assert.ok(!html.includes('MATHBLOCK'), '行内 $$ 不应生成行内占占位');
});

test('成对 $...$ 跨单元格不被配对', async () => {
  // 两个单元格各一个 $ 不应拼成一条公式
  const md = '| a | b |\n| - | - |\n| $x | y$ |';
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('$x'), '第一格 $ 原样显示');
  assert.ok(html.includes('y$'), '第二格 $ 原样显示');
  assert.ok(!html.includes('MATHBLOCK'), '跨单元格不成对，不生成占位符');
});

test('成对 $...$ 还原为转义文本（KaTeX 在 DOM 阶段渲染）', async () => {
  const html = renderMarkdown('行内 $a+b$ 公式', { softBreaks: false });
  // restoreMathBlocks 会把占位符替换回转义后的纯文本，KaTeX 在浏览器里渲染
  assert.ok(html.includes('$a+b$'), '成对 $...$ 应还原为字面量文本（供后续 KaTeX 渲染）');
  assert.ok(html.includes('公式'), '后续文字不应被吞');
});

test('成对 $$...$$ 还原为块级 math-display', async () => {
  const html = renderMarkdown('$$c^2$$', { softBreaks: false });
  assert.ok(html.includes('math-display'), '成对 $$...$$ 应生成 math-display 占位');
});

test('孤立不成对 $ 原样显示不吞后续', async () => {
  const html = renderMarkdown('价格 $100 起，详见下文', { softBreaks: false });
  assert.ok(html.includes('$100'), '孤立 $ 应原样显示');
  assert.ok(html.includes('详见下文'), '后续内容不应被吞掉');
  assert.ok(!html.includes('MATHBLOCK'), '不应生成 MATHBLOCK');
});

test('代码块/反引号内 $ 不处理', async () => {
  const md = [
    '```',
    '$a+b$',
    '```',
    '',
    '行内 `$c+d$` 示例',
  ].join('\n');
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('$a+b$'), '代码块内 $ 应原样保留');
  assert.ok(html.includes('$c+d$'), '反引号内 $ 应原样保留');
  assert.ok(!html.includes('MATHBLOCK'), '代码块/反引号内不应生成 MATHBLOCK');
});

test('$ 后接空格不触发公式', async () => {
  const html = renderMarkdown('金额 $ 100 起', { softBreaks: false });
  assert.ok(html.includes('$ 100'), '$ 空格后 应原样显示');
});

test('孤立 == 原样显示不丢字符（方案 B）', async () => {
  const html = renderMarkdown('x == y 表示相等', { softBreaks: false });
  assert.ok(html.includes('x == y 表示相等'), '孤立 == 应原样显示，不丢 =');
  assert.ok(!html.includes('<mark>'), '孤立 == 不应生成 <mark>');
});

test('成对 ==x== 仍高亮', async () => {
  const html = renderMarkdown('这是 ==重点== 内容', { softBreaks: false });
  assert.ok(html.includes('<mark>重点</mark>'), '成对 == 应高亮');
});

test('代码块内 == 不被高亮', async () => {
  const md = [
    '```js',
    'if (a == b) {}',
    '```',
  ].join('\n');
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('a == b'), '代码块内 == 应原样保留');
  assert.ok(!html.includes('<mark>'), '代码块内 == 不应高亮');
});

test('blockquote 内 lazy continuation 表格渲染为 HTML <table>', async () => {
  const md = [
    '> 引用内容',
    '| 列1 | 列2 |',
    '| --- | --- |',
    '| 数据1 | 数据2 |',
  ].join('\n');
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('blockquote'), '应包含 blockquote');
  assert.ok(html.includes('<table>'), '应包含 table');
  const bqEnd = html.indexOf('</blockquote>');
  const tableStart = html.indexOf('<table>');
  assert.ok(tableStart < bqEnd, 'table 应在 blockquote 内');
  assert.ok(html.includes('数据1'), '表格数据应渲染');
});

test('无序列表内 lazy continuation 表格渲染为 HTML <table>', async () => {
  const md = '- 列表项\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('<ul '), '应包含 ul');
  assert.ok(html.includes('<table'), '应包含 table');
  assert.ok(html.includes('</li>'), '应包含 li 闭合');
});

test('有序列表内 lazy continuation 表格渲染为 HTML <table>', async () => {
  const md = '1. 列表项\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('<ol '), '应包含 ol');
  assert.ok(html.includes('<table'), '应包含 table');
});

test('任务列表内 lazy continuation 表格渲染为 HTML <table>', async () => {
  const md = '- [x] 已完成\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('<input'), '应包含 checkbox');
  assert.ok(html.includes('<table>'), '应包含 table');
});

test('空行隔开时表格不视为 lazy continuation', async () => {
  const md = '> 引用内容\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('blockquote'), '应包含 blockquote');
  assert.ok(html.includes('<table'), '应包含 table');
  const bqEnd = html.indexOf('</blockquote>');
  const tableStart = html.indexOf('<table');
  assert.ok(bqEnd < tableStart, '空行隔开时 table 应在 blockquote 外');
});

test('容器内表格单元格内联 Markdown 被渲染', async () => {
  const md = [
    '> 引用',
    '| **粗体** | `代码` | *斜体* |',
    '| -------- | ------ | ------ |',
    '| ~~删~~ | [链接](/) | 普通 |',
  ].join('\n');
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('<strong>粗体</strong>'), '** 应渲染为 strong');
  assert.ok(html.includes('<code>代码</code>'), '` 应渲染为 code');
  assert.ok(html.includes('<em>斜体</em>'), '* 应渲染为 em');
  assert.ok(html.includes('<del>删</del>'), '~~ 应渲染为 del');
  assert.ok(html.includes('<a href="/">链接</a>'), '[]() 应渲染为链接');
});

// ---- 内联 style 安全放开（2026-07-26）：保留合法样式，剥离危险 CSS ----
test('内联 style 合法声明被保留（日期卡片可渲染）', async () => {
  const md = `<div style="display: flex; justify-content: space-between; background-color: #f8f9fa; padding: 15px 20px; border-radius: 12px; margin-bottom: 30px; font-weight: 600; color: #2c3e50; border: 1px solid #e9ecef;">
    <span style="font-size: 1.2rem;">7月22日</span>
    <span style="color: #6c757d;">星期五</span>
</div>`;
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('<div'), 'div 应渲染');
  assert.ok(html.includes('display: flex'), 'display:flex 应保留');
  assert.ok(html.includes('justify-content: space-between'), 'justify-content 应保留');
  assert.ok(html.includes('background-color: #f8f9fa'), 'background-color 应保留');
  assert.ok(html.includes('font-size: 1.2rem'), 'font-size 应保留');
  assert.ok(html.includes('color: #6c757d'), 'color 应保留');
  assert.ok(html.includes('7月22日') && html.includes('星期五'), '文本应保留');
});

test('内联 style 危险 CSS 逐条剥离，安全声明保留', async () => {
  const md = `<div style="color:red; display:none; padding:8px; @import 'evil.css'; visibility:hidden; width:exp/* */ression(alert(1)); -moz-binding:url(x.xml);">x</div>`;
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(!/display\s*:\s*none/.test(html), 'display:none 应被剥离');
  assert.ok(!/visibility\s*:\s*hidden/.test(html), 'visibility:hidden 应被剥离');
  assert.ok(!/expression\s*\(/i.test(html), 'expression() 应被剥离');
  assert.ok(!/@import/i.test(html), '@import 应被剥离');
  assert.ok(!/-moz-binding/i.test(html), '-moz-binding 应被剥离');
  // 安全声明逐条保留（defense in depth：rehype-sanitize + sanitizeStyleValue 双重过滤）
  assert.ok(html.includes('color: red'), 'color:red 安全声明应保留');
  assert.ok(html.includes('padding: 8px'), 'padding 安全声明应保留');
  assert.ok(html.includes('x'), '正文应保留');
});

test('内联 style 含 url(javascript:) 时整条属性被丢弃', async () => {
  // rehype-sanitize 对 url(javascript:) 采取整条 style 丢弃策略（同属性下的安全声明一并移除，属正常安全行为）
  const md = `<div style="background:url(javascript:alert(1)); color:red;">x</div>`;
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(!/javascript:/i.test(html), 'url(javascript:) 不应出现');
  assert.ok(!/color:\s*red/i.test(html), '含危险 url 的整条 style 被丢弃');
  assert.ok(html.includes('x'), '正文应保留');
});

test('非 div/span 标签的内联 style 也保留', async () => {
  const md = `<p style="text-align:center; line-height:1.8;">居中段落</p>`;
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(html.includes('<p'), 'p 应渲染');
  assert.ok(html.includes('text-align: center'), 'text-align 应保留');
  assert.ok(html.includes('line-height: 1.8'), 'line-height 应保留');
});

test('事件处理器 on* 仍被剥离', async () => {
  const md = `<div style="color:red" onclick="alert(1)">x</div>`;
  const html = renderMarkdown(md, { softBreaks: false });
  assert.ok(!/onclick/i.test(html), 'onclick 应被剥离');
  assert.ok(html.includes('color: red'), '合法 style 仍保留');
});

