// LaTeX 数学定界符 \(...\) / \[...\] 渲染支持测试。
// 覆盖：行内/块级归一化、跨行块级、代码块/行内代码内不误转、不成对回退、原有 $ 数学回归。
// 复用现有 KaTeX($) 管线：guardMathBlocks 在原文阶段把 LaTeX 定界符归一化为 $...$ / $$...$$。
const test = require('node:test');
const assert = require('node:assert');
const { renderMarkdown } = require('../src/unified-renderer.js');

function render(md) {
  return renderMarkdown(md, { softBreaks: false });
}

test('行内 LaTeX \\(...\\) 归一化为行内 $...$ 并渲染', () => {
  const html = render('这是公式 \\(S=\\pi r^2\\)');
  assert.ok(html.includes('$S=\\pi r^2$'), '应出现行内 $...$ 文本: ' + html);
  assert.ok(!html.includes('\\('), '不应残留 \\(: ' + html);
  assert.ok(!html.includes('\\)'), '不应残留 \\): ' + html);
});

test('块级 LaTeX \\[...\\] 归一化为块级 $$...$$ 并渲染为 math-display', () => {
  const html = render('\\[S=\\pi r^2\\]');
  assert.ok(html.includes('$$S=\\pi r^2$$'), '应出现块级 $$...$$: ' + html);
  assert.ok(html.includes('math-display'), '应包裹在 math-display: ' + html);
  assert.ok(!html.includes('\\['), '不应残留 \\[: ' + html);
  assert.ok(!html.includes('\\]'), '不应残留 \\]: ' + html);
});

test('块级 \\[...\\] 可跨行', () => {
  const html = render('\\[\nS=\\pi r^2\n\\]');
  assert.ok(html.includes('math-display'), '应包裹在 math-display: ' + html);
  assert.ok(!html.includes('\\['), '不应残留 \\[: ' + html);
});

test('围栏代码块内的 \\(...\\) 不被转换（保持字面量）', () => {
  const md = '```\n\\(x\\)\n```';
  const html = render(md);
  assert.ok(html.includes('\\(x\\)'), '代码块内应保持 \\(x\\): ' + html);
  assert.ok(!html.includes('$x$'), '代码块内不应出现 $x$: ' + html);
});

test('行内代码（`...`）内的 \\(...\\) 不被转换（inBacktick 守卫）', () => {
  const html = render('`\\(x\\)`');
  assert.ok(html.includes('\\(x\\)'), '行内代码内应保持 \\(x\\): ' + html);
  assert.ok(!html.includes('$x$'), '行内代码内不应出现 $x$: ' + html);
});

test('不成对的 \\( 回退为字面量（CommonMark 转义为 (，不生成数学）', () => {
  const html = render('文字 \\( 没有闭合');
  assert.ok(!html.includes('\\('), '不成对 \\( 应被转义为 (，不残留 \\(: ' + html);
  assert.ok(!html.includes('$'), '不应生成数学占位: ' + html);
  assert.ok(html.includes('('), '应渲染为字面 (: ' + html);
});

test('不成对的 \\[ 回退为字面量（CommonMark 转义为 [，不生成块级数学）', () => {
  const html = render('\\[ 没有闭合');
  assert.ok(!html.includes('\\['), '不成对 \\[ 应被转义为 [，不残留 \\[: ' + html);
  assert.ok(!html.includes('math-display'), '不应生成块级数学: ' + html);
  assert.ok(html.includes('['), '应渲染为字面 [: ' + html);
});

test('回归：原有的行内 $...$ 仍正常', () => {
  const html = render('行内 $E=mc^2$ 公式');
  assert.ok(html.includes('$E=mc^2$'), '原有 $ 行内数学应保留: ' + html);
});

test('回归：原有的块级 $$...$$ 仍正常', () => {
  const html = render('$$\nS=\\pi r^2\n$$');
  assert.ok(html.includes('math-display'), '块级 $$ 应渲染为 math-display: ' + html);
});

test('混合：同一文档同时含 LaTeX 与 $ 数学', () => {
  const md = '行内 \\(a^2+b^2=c^2\\) 与 $E=mc^2$ 以及块级：\n\\[\nx=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\n\\]';
  const html = render(md);
  assert.ok(html.includes('$a^2+b^2=c^2$'), 'LaTeX 行内应归一化: ' + html);
  assert.ok(html.includes('$E=mc^2$'), '原有 $ 应保留: ' + html);
  assert.ok(html.includes('math-display'), 'LaTeX 块级应渲染: ' + html);
  assert.ok(!html.includes('\\(') && !html.includes('\\['), '不应残留 LaTeX 定界符: ' + html);
});
