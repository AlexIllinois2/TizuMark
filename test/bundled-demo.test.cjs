// demo.md 打包资源与预览回归测试。
// 覆盖：根目录单一 demo、Tauri 资源配置、引用中的代码块，以及打包文档图片路径。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { renderMarkdown } = require('../src/unified-renderer.js');
const { withEditor } = require('./helpers/app-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('demo 资源：只保留根目录 demo.md，并随 Tauri 打包图片目录', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'demo.md')), '根目录 demo.md 必须存在');
  assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'demo.md')), 'src/demo.md 不应再保留重复副本');
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.deepEqual(conf.bundle.resources, ['../demo.md', '../screenshots'], 'demo 与截图目录应作为资源打包');
  assert.match(read('scripts/bench-render.js'), /path\.resolve\(__dirname, '\.\.', 'demo\.md'\)/,
    '渲染基准应读取唯一的根目录 demo.md');
});

test('demo 引用中的代码：shell 围栏内容完整位于 blockquote 内', () => {
  const html = renderMarkdown(read('demo.md'));
  const start = html.indexOf('引用中的代码');
  assert.notEqual(start, -1, '应找到引用中的代码章节');
  const section = html.slice(start, start + 900);
  assert.match(section, /<blockquote[^>]*>[\s\S]*<pre><code class="language-shell"[^>]*>\s*npm run build\s*<\/code><\/pre>[\s\S]*构建产物位于/,
    'shell 代码和后续说明应保持在同一个引用块中');
  assert.doesNotMatch(section, /<\/blockquote>\s*<p[^>]*>npm run build<\/p>/,
    'npm run build 不应脱离引用块成为普通段落');
});

test('打包 demo 图片：相对路径按资源 demo.md 所在目录读取', async () => {
  const calls = [];
  await withEditor({
    invokeImpl: async (cmd, args) => {
      if (cmd === 'fetch_image_as_base64') {
        calls.push(args);
        return 'iVBORw0KGgo=';
      }
      return undefined;
    },
  }, async (w, ed) => {
    ed.tabs = [{ filePath: 'C:\\Program Files\\TizuMark\\demo.md' }];
    ed.activeTabIndex = 0;
    ed.preview.innerHTML = '<img src="screenshots/01-main.png" width="400" alt="限制宽度展示">';
    await ed.processImages();
    assert.equal(calls.length, 1, '应读取 1 张图片');
    assert.equal(calls[0].url, 'C:\\Program Files\\TizuMark/screenshots/01-main.png',
      '图片应基于打包 demo.md 的资源目录解析');
    const img = ed.preview.querySelector('img');
    assert.ok(img.src.startsWith('data:image/png;base64,'), '图片应转换为可显示的 data URI');
    assert.equal(img.getAttribute('width'), '400', 'HTML img 的 width 属性应保留');
  });
});

test('打包 demo 打开：资源回退必须把真实资源路径传给标签页', () => {
  const app = read('src/app.js');
  assert.match(app, /await this\._openBundledFile\(href, content, p\)/,
    '从 resourceDir 回退读取 demo 时应保留 p，供相对图片解析');
});
