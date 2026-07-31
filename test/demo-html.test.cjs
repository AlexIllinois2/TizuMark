// demo.md 新增原生 HTML 标签的真实渲染校验（使用真实 unified 渲染管线，
// 不走游离 fake DOM）。覆盖：details/summary、ruby、u/ins/center、progress、
// figure/figcaption、行内反引号数学。这些标签必须经安全过滤后仍保留。
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMarkdown } = require('../src/unified-renderer.js');

const render = (md) => renderMarkdown(md, { softBreaks: false });

test('demo-html: details / summary 折叠块渲染为真实标签', () => {
  const html = render('<details>\n<summary>标题</summary>\n\n内容文字\n\n</details>');
  assert.ok(html.includes('<details>'), '应保留 <details>');
  assert.ok(html.includes('<summary>标题</summary>'), '应保留 <summary> 标题');
  assert.ok(html.includes('内容文字'), '折叠块内文字应保留');
});

test('demo-html: ruby / rt 注音渲染', () => {
  const html = render('<ruby>汉字<rt>hàn zì</rt></ruby>');
  assert.ok(html.includes('<ruby>'), '应保留 <ruby>');
  assert.ok(html.includes('<rt>hàn zì</rt>'), '应保留 <rt> 注音');
});

test('demo-html: u / ins / center 行内样式渲染（不被安全过滤剥离）', () => {
  const html = render('看 <u>下划线</u>、<ins>插入</ins> 与 <center>居中</center> 文本');
  assert.ok(html.includes('<u>下划线</u>'), '应保留 <u>');
  assert.ok(html.includes('<ins>插入</ins>'), '应保留 <ins>');
  assert.ok(html.includes('<center>居中</center>'), '应保留 <center>');
});

test('demo-html: 独立 center 块不应落入列表，且内容可居中', () => {
  const html = render('<center>居中显示的文本</center>');
  assert.ok(!html.includes('<li>'), '独立 center 不应被渲染成列表项');
  assert.ok(html.includes('<center>居中显示的文本</center>'), '应保留独立 center 块');
});

test('demo-html: 列表中的 center 标签保持列表语义', () => {
  const html = render('- <center>列表内文本</center>');
  assert.ok(html.includes('<li'), '列表项应保留');
  assert.ok(html.includes('<center>列表内文本</center>'), '列表内 center 内容应保留');
});
test('demo-html: progress 进度条保留 value / max 属性', () => {
  const html = render('进度：<progress value="70" max="100"></progress>');
  assert.ok(html.includes('<progress'), '应保留 <progress>');
  assert.ok(/<progress[^>]*value="70"/.test(html), '应保留 value 属性');
  assert.ok(/<progress[^>]*max="100"/.test(html), '应保留 max 属性');
});

test('demo-html: figure / figcaption 图注渲染', () => {
  const html = render('<figure>\n<img src="assets/icon.png" alt="图标">\n<figcaption>说明文字</figcaption>\n</figure>');
  assert.ok(html.includes('<figure>'), '应保留 <figure>');
  assert.ok(html.includes('<figcaption>说明文字</figcaption>'), '应保留 <figcaption>');
});

test('demo-html: 行内反引号数学 `$...$` 转为行内公式文本（非 code）', () => {
  const html = render('质能方程 `` `$E = mc^2$` `` 与勾股 `` `$a^2+b^2=c^2$` ``');
  assert.ok(!html.includes('<code>$E = mc^2$</code>'), '反引号数学不应仍是 <code>');
  assert.ok(html.includes('$E = mc^2$'), '应得到行内公式文本 $E = mc^2$');
  assert.ok(html.includes('$a^2+b^2=c^2$'), '应得到行内公式文本 $a^2+b^2=c^2$');
});

test('demo-html: GitHub 风格 `$`...`$` 行内数学', () => {
  const html = render('示例 $`x^2`$ 也应渲染');
  assert.ok(html.includes('$x^2$'), '应合并为行内公式 $x^2$');
});
