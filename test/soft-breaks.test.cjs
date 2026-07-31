// 回归测试：软换行（softBreaks）开关。
// 修复前 remarkBreaks 被无条件调用，导致单换行无论开关都渲染成 <br>，开关失效；
// 且关掉时连正规的硬换行（两空格 / 反斜杠）也丢失。
// 修复后：
//   softBreaks=true  → 所有换行（单 \n 与硬换行）统一渲染为 <br>
//   softBreaks=false → 单 \n 保持默认软换行（不生成 <br>），仅硬换行渲染为 <br>
const test = require('node:test');
const assert = require('node:assert');
const { renderMarkdown } = require('../src/unified-renderer.js');

const brCount = (html) => (html.match(/<br>/g) || []).length;

// ---------- 段落 ----------
test('段落单换行：开→<br>，关→无<br>且文本保留', async () => {
  const md = '第一行\n第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 1, '开时单换行应生成 1 个 <br>');
  assert.strictEqual(brCount(off), 0, '关时单换行不应生成 <br>');
  assert.ok(off.includes('第一行') && off.includes('第二行'), '关时文本应原样保留');
});

test('连续多行：开→N 个<br>，关→0 个', async () => {
  const md = '一\n二\n三\n四';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 3, '开时 3 个换行应生成 3 个 <br>');
  assert.strictEqual(brCount(off), 0, '关时 3 个换行不应生成 <br>');
});

// ---------- 硬换行（任何时候都应保留）----------
test('双空格硬换行：开/关均生成 <br>', async () => {
  const md = '第一行  \n第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 1, '开时硬换行应生成 <br>');
  assert.strictEqual(brCount(off), 1, '关时硬换行仍应生成 <br>');
});

test('反斜杠硬换行：开/关均生成 <br>', async () => {
  const md = '第一行\\\n第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 1, '开时硬换行应生成 <br>');
  assert.strictEqual(brCount(off), 1, '关时硬换行仍应生成 <br>');
});

test('硬换行 + 软换行混合：关时仅硬换行生效', async () => {
  // 第一行(硬) \ 第二行(软) \ 第三行(硬) \ 第四行
  const md = '第一行  \n第二行\n第三行  \n第四行';
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(off), 2, '关时只有 2 个硬换行生成 <br>，软换行不生成');
});

// ---------- 列表 / 引用 ----------
test('无序列表项内换行：开→<br>，关→无', async () => {
  const md = '- 项一第一行\n项一第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 1, '开时列表项内换行应生成 <br>');
  assert.strictEqual(brCount(off), 0, '关时列表项内换行不应生成 <br>');
});

test('有序列表项内换行：开→<br>，关→无', async () => {
  const md = '1. 项一第一行\n项一第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 1);
  assert.strictEqual(brCount(off), 0);
});

test('嵌套列表内换行：开→<br>，关→无', async () => {
  const md = '- 父项\n  - 子项第一行\n子项第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 1);
  assert.strictEqual(brCount(off), 0);
});

test('引用内换行：开→<br>，关→无', async () => {
  const md = '> 引用第一行\n> 引用第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 1);
  assert.strictEqual(brCount(off), 0);
});

test('引用内硬换行：关时仍生成 <br>', async () => {
  const md = '> 引用第一行  \n> 引用第二行';
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(off), 1, '关时引用内硬换行应保留 <br>');
});

// ---------- 多段落（空行分隔，不应被软换行影响）----------
test('空行分隔多段落：开/关均不生成 <br>', async () => {
  const md = '第一段\n\n第二段';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 0, '段落间空行不应生成 <br>');
  assert.strictEqual(brCount(off), 0);
  assert.ok(on.includes('<p') && off.includes('<p'), '应为独立段落');
});

// ---------- 代码块 / 行内代码不受影响 ----------
test('围栏代码块内换行：开/关均不生成 <br>', async () => {
  const md = '```\nline1\nline2\nline3\n```';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 0, '代码块内换行不应变成 <br>');
  assert.strictEqual(brCount(off), 0);
  assert.ok(on.includes('<pre') && on.includes('line1') && on.includes('line3'), '代码内容原样保留');
});

test('行内代码内换行：开/关均不生成 <br>', async () => {
  const md = '文本 `code\nline` 结束';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 0);
  assert.strictEqual(brCount(off), 0);
  assert.ok(on.includes('<code'), '行内代码应保留');
});

// ---------- 标题（markdown 标题为单行，不应有 <br>）----------
test('标题内换行：开/关均不生成 <br>', async () => {
  const md = '# 标题第一行\n标题第二行';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.strictEqual(brCount(on), 0);
  assert.strictEqual(brCount(off), 0);
});

// ---------- 其他功能回归：确保软换行改动未破坏 ----------
test('脚注：开/关均正常渲染定义', async () => {
  const md = '正文有引用[^1]。\n\n[^1]: 脚注定义内容。';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.ok(on.includes('脚注定义内容') || on.includes('footnote'), '开时脚注应渲染');
  assert.ok(off.includes('脚注定义内容') || off.includes('footnote'), '关时脚注应渲染');
});

test('容器内表格（blockquote 内）：开/关均渲染为 <table>', async () => {
  const md = '> 结论。\n>\n> | 意图 | 占比 |\n> |------|------|\n> | other | 27% |';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.ok(on.includes('<table'), '开时容器内表格应渲染为 <table>');
  assert.ok(off.includes('<table'), '关时容器内表格应渲染为 <table>');
});

test('数学公式 $...$ 配对：开/关均不受软换行影响', async () => {
  const md = '质能方程 $E = mc^2$ 是著名公式。';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  assert.ok(on.includes('E = mc^2') || on.includes('math'), '开时公式应保留');
  assert.ok(off.includes('E = mc^2') || off.includes('math'), '关时公式应保留');
});

// ---------- XSS 净化：确保管线未被软换行改动破坏 ----------
test('XSS 脚本载荷：开/关均被净化剥离', async () => {
  const md = '正常文本 <script>alert(1)</script> 和 <img src=x onerror=alert(2)>';
  const on = renderMarkdown(md, { softBreaks: true });
  const off = renderMarkdown(md, { softBreaks: false });
  for (const html of [on, off]) {
    assert.ok(!html.includes('<script>'), 'script 标签应被剥离');
    assert.ok(!html.includes('onerror'), 'onerror 属性应被剥离');
    assert.ok(html.includes('正常文本'), '正常文本应保留');
  }
});
