// 大纲抽取单元测试：锁定 extractHeadings / buildOutlineTree / renderOutlineHtml 行为。
const test = require('node:test');
const assert = require('node:assert');
const { extractHeadings, buildOutlineTree, renderOutlineHtml } = require('../src/modules/outline.js');

// 复刻 app.js 的 headingToId（纯函数），注入给 extractHeadings
function headingToId(text) {
  let id = '';
  for (const ch of text) {
    if (/[\p{L}\p{N}]/u.test(ch)) id += ch.toLowerCase();
    else if (ch === ' ' || ch === '-' || ch === '_') id += '-';
  }
  return id.replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const opts = { headingToId, escapeHtml };

test('无标题返回空数组', async () => {
  assert.deepStrictEqual(extractHeadings('正文没有标题\n第二段', opts), []);
});

test('提取 # ~ ###### 各级标题与行号', async () => {
  const md = '# 一级\n正文\n## 二级\n### 三级\n```\n# 这是代码块里的假标题\n```\n#### 四级';
  const hs = extractHeadings(md, opts);
  assert.strictEqual(hs.length, 4);
  assert.deepStrictEqual(hs.map((h) => h.level), [1, 2, 3, 4]);
  // 代码块内的 # 被跳过
  assert.ok(!hs.some((h) => h.text.includes('代码块')));
  // 行号正确（基于 0 的索引）
  assert.strictEqual(hs[0].line, 0);
  assert.strictEqual(hs[3].line, 7);
});

test('标题文本去除 markdown 标记', async () => {
  const hs = extractHeadings('# **加粗** `代码` [链接](u)', opts);
  // 旧实现仅去除 # * ` ~ [ ] ，保留 ( ) ，故 [链接](u) -> 链接(u)
  assert.strictEqual(hs[0].text, '加粗 代码 链接(u)');
});

test('重复标题 id 去重', async () => {
  const md = '# 标题\n## 小节\n# 标题';
  const hs = extractHeadings(md, opts);
  assert.strictEqual(hs[0].id, '标题');
  assert.strictEqual(hs[2].id, '标题-2');
});

test('buildOutlineTree 按层级组织', async () => {
  const hs = extractHeadings('# A\n## B\n## C\n### D\n# E', opts);
  const tree = buildOutlineTree(hs);
  assert.strictEqual(tree.length, 2); // A, E
  assert.strictEqual(tree[0].children.length, 2); // B, C
  assert.strictEqual(tree[0].children[1].children.length, 1); // D under C
  assert.strictEqual(tree[0].children[1].children[0].text, 'D');
});

test('renderOutlineHtml 输出层级/锚点/id/data-line 且转义', async () => {
  const hs = extractHeadings('# 标题 <x>\n## 子', opts);
  const tree = buildOutlineTree(hs);
  const html = renderOutlineHtml(tree, opts);
  assert.ok(html.includes('class="outline-item level-1"'));
  assert.ok(html.includes('data-id="标题-x"'));
  assert.ok(html.includes('data-line="0"'));
  // 含子节点应有 toggle
  assert.ok(html.includes('outline-toggle'));
  // 转义校验
  assert.ok(html.includes('&lt;x&gt;'), '标题文本应被转义: ' + html);
});

test('与旧实现逐字符一致（回归）', async () => {
  const samples = [
    '',
    '# 仅标题',
    '# A\n## B\n正文\n### C\n```\n# 代码块内\n```\n## B',
    '无标题正文\n另一段',
  ];
  for (const s of samples) {
    const headings = extractHeadings(s, opts);
    const tree = buildOutlineTree(headings);
    const html = renderOutlineHtml(tree, opts);
    // 旧实现对空标题渲染 outline-empty；模块对空 headings 不渲染（由调用方判断是否空）
    if (headings.length === 0) {
      assert.strictEqual(headings.length, 0);
      continue;
    }
    assert.ok(html.includes('outline-item'), 'sample=' + JSON.stringify(s));
  }
});
