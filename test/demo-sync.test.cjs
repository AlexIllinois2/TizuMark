// demo.md（使用说明/打包资源）与 testdemo.md（本地测试副本）的同步与打开校验。
// testdemo.md 是 demo.md 的镜像，仅图片路径不同（指向仓库内真实 screenshots/，便于离线测试打开 md）。
// 约定：每次修改 demo.md 时必须同步修改 testdemo.md（图片路径除外）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withEditor } = require('./helpers/app-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 把两种图片路径统一成同一个 token，用来比较「除了图片路径之外是否完全一致」
const canonicalize = (s) => s.replace(/assets\/icon\.png/g, 'ICON').replace(/screenshots\/01-main\.png/g, 'ICON');

test('testdemo.md 存在且与 demo.md 同步（仅图片路径不同）', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'testdemo.md')), '根目录 testdemo.md 必须存在');
  const demo = read('demo.md');
  const testdemo = read('testdemo.md');
  assert.equal(canonicalize(testdemo), canonicalize(demo),
    'testdemo.md 必须与 demo.md 完全一致，除 assets/icon.png ↔ screenshots/01-main.png 图片路径外');
  // 反向确认：demo.md 用打包图标，testdemo.md 用本地截图
  assert.ok(demo.includes('assets/icon.png'), 'demo.md 应引用随包图标 assets/icon.png');
  assert.ok(testdemo.includes('screenshots/01-main.png'), 'testdemo.md 应引用本地截图 screenshots/01-main.png');
});

test('打开 testdemo.md（普通本地文件）：图片走 fetch_image_as_base64，不回退打包资源', async () => {
  const calls = [];
  await withEditor({
    invokeImpl: async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === 'fetch_image_as_base64') return 'iVBORw0KGgo='; // 1x1 PNG
      if (cmd === 'read_bundled_image_as_base64') return 'SHOULD-NOT-CALL';
      return undefined;
    },
  }, async (w, ed) => {
    // 模拟双击打开项目根目录的 testdemo.md：有真实 filePath，NOT isBundled
    ed.tabs = [{ filePath: 'D:/project/tizu-mark/testdemo.md', name: 'testdemo.md' }];
    ed.activeTabIndex = 0;
    ed.preview.innerHTML = '<img src="screenshots/01-main.png" alt="截图">';
    await ed.processImages();
    const fetchCalls = calls.filter(c => c.cmd === 'fetch_image_as_base64');
    const bundledCalls = calls.filter(c => c.cmd === 'read_bundled_image_as_base64');
    assert.equal(fetchCalls.length, 1, '本地文件应走 fetch_image_as_base64');
    assert.equal(fetchCalls[0].args.url, 'D:/project/tizu-mark/screenshots/01-main.png',
      '应相对 testdemo.md 所在目录拼出截图绝对路径');
    assert.equal(bundledCalls.length, 0, '普通本地文件绝不应回退到打包资源');
    const img = ed.preview.querySelector('img');
    assert.ok(img.src.startsWith('data:image/png;base64,'), '应显示本地截图');
  });
});
