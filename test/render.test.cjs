// Markdown 渲染盲点测试（整理测试库时补充）：
// 直接调用打包后的 unified 渲染器（src/lib/unified-bundle.js），验证 GFM 常见语法的输出，
// 不依赖 DOM / Tauri。覆盖：任务列表、表格、删除线、脚注、定义列表、围栏代码、标题、链接、图片。
//
// 该包导出 module.exports = { renderMarkdown }，可在 node 直接 require。

const test = require('node:test');
const assert = require('node:assert');
const { loadUnifiedRenderer } = require('./helpers/load-bundle.cjs');
const { JSDOM } = require('jsdom');

// 渲染包在浏览器里以 <script> 加载，定义全局 UnifiedRenderer（不走 module.exports），
// 且初始化时引用 document（HTML 实体解码依赖 DOM）。这里用 jsdom 窗口 eval 加载。
const _dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const _w = _dom.window;
global.window = _w;
global.document = _w.document;
global.navigator = _w.navigator;

// 产物加载统一走 helpers/load-bundle.cjs（P0-0e）：缺失时给可操作指引而非 ENOENT 堆栈。
const renderMarkdown = loadUnifiedRenderer(_w).renderMarkdown;

function render(md, opts = { softBreaks: false }) {
  return renderMarkdown(md, opts);
}

test('render: 任务列表渲染 checkbox', async () => {
  const html = render('- [ ] 待办\n- [x] 已完成');
  assert.ok(html.includes('type="checkbox"'), '任务列表应渲染 checkbox');
  assert.ok(html.includes('disabled'), '渲染的 checkbox 应禁用（只读预览）');
  assert.ok(html.includes('checked'), '已勾选项应带 checked');
});

test('render: 表格渲染 thead/tbody', async () => {
  const html = render('| 列1 | 列2 |\n| --- | --- |\n| a | b |');
  assert.ok(html.includes('<table'), '应渲染 table');
  assert.ok(html.includes('<th'), '应渲染表头 th');
  assert.ok(html.includes('<td'), '应渲染单元格 td');
});

test('render: 删除线 ~~x~~', async () => {
  const html = render('这是 ~~删除~~ 文本');
  assert.ok(html.includes('<del'), '删除线应渲染为 <del>');
});

test('render: 脚注', async () => {
  const html = render('正文有脚注[^1]\n\n[^1]: 脚注内容');
  assert.ok(html.includes('footnote') || html.includes('id="fn'), '应渲染脚注区块');
});

test('render: 定义列表', async () => {
  const html = render('术语\n: 解释');
  assert.ok(html.includes('<dl') || html.includes('<dt') || html.includes('<dd'),
    '定义列表应渲染 dl/dt/dd');
});

test('render: 围栏代码带语言类', async () => {
  const html = render('```js\nconst a = 1;\n```');
  assert.ok(html.includes('<pre') && html.includes('<code'), '应渲染 pre/code');
  assert.ok(/class="[^"]*language-js/.test(html), '代码块应带 language-js 类');
});

test('render: 标题渲染', async () => {
  const html = render('# 一级标题\n## 二级');
  assert.ok(html.includes('<h1'), '应渲染 h1');
  assert.ok(html.includes('<h2'), '应渲染 h2');
});

test('render: 链接与图片', async () => {
  const html = render('[百度](https://baidu.com)\n![图](img.png)');
  assert.ok(html.includes('href="https://baidu.com"'), '应渲染链接 href');
  assert.ok(html.includes('<img') && html.includes('src="img.png"'), '应渲染 img 标签');
});

test('render: 软换行选项 softBreaks', async () => {
  const withBr = render('第一行\n第二行', { softBreaks: true });
  const noBr = render('第一行\n第二行', { softBreaks: false });
  assert.ok(withBr.includes('<br'), 'softBreaks=true 应插入 <br>');
  assert.ok(!noBr.includes('<br'), 'softBreaks=false 不应插入 <br>');
});

test('render: 有序/无序列表', async () => {
  const html = render('1. 一\n2. 二\n\n- 甲\n- 乙');
  assert.ok(html.includes('<ol') && html.includes('<li'), '有序列表应渲染 ol/li');
  assert.ok(html.includes('<ul') && (html.match(/<li[ >]/g) || []).length >= 4, '无序列表应渲染 ul/li');
});

test('render: 引用块', async () => {
  const html = render('> 引用内容');
  assert.ok(html.includes('<blockquote'), '应渲染 blockquote');
});
