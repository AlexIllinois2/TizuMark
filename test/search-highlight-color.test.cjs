// 搜索高亮配色回归测试
// 复现 bug：搜索高亮原来是黄色（#ffe24d），与 Markdown ==高亮== 的黄色（var(--color-warning)）几乎一样，
// 预览里搜索高亮是 <mark> 元素，还会被 .preview-content mark 的黄色规则以更高特异性覆盖，导致两者无法区分。
// 修复：搜索高亮统一改为醒目祖母绿 #00c389，并为预览 <mark> 搜索高亮加更高特异性规则。
// 本测试直接从 styles.css 断言规则，避免 jsdom 不加载外部样式的不可靠性。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

test('search highlight: 颜色已改为醒目祖母绿，且与 Markdown 黄色高亮区分', () => {
  // 1) 编辑区 .search-match 背景不再是黄色
  const m = css.match(/\.search-match\s*\{([^}]*)\}/);
  assert.ok(m, '.search-match 规则应存在');
  assert.ok(/background-color:\s*#00c389/i.test(m[1]),
    '.search-match 背景应为醒目祖母绿 #00c389，而非黄色');
  assert.ok(!/background-color:\s*#ffe24d/i.test(m[1]),
    '.search-match 不应再是旧黄色 #ffe24d');

  // 2) 预览中的搜索高亮是 <mark>，需更高特异性规则覆盖 .preview-content mark 的黄色
  const pm = css.match(/\.preview-content\s+mark\.search-match\s*\{([^}]*)\}/);
  assert.ok(pm, '应存在 .preview-content mark.search-match 规则，确保预览搜索高亮不被 Markdown 黄色覆盖');
  assert.ok(/background-color:\s*#00c389/i.test(pm[1]),
    '预览搜索高亮背景也应为 #00c389');

  // 3) Markdown ==高亮== 仍保持黄色（var(--color-warning)），与搜索色不同
  assert.ok(
    /\.preview-content\s+mark\s*\{[^}]*background-color:\s*var\(--color-warning\)/s.test(css),
    'Markdown ==高亮== 应保持黄色 var(--color-warning)'
  );
});
