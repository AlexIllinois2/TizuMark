// 图片/图表查看器（lightbox）背景随主题切换的静态契约测试。
// 要求：亮色模式（默认）浅灰/亮色背景；暗色模式（[data-theme="dark"]）保持原深色背景。
// 提示条（.lightbox-hint）同步：亮色深字浅底、暗色白字深底。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

test('image-lightbox 默认（亮色）背景为浅灰', () => {
  const block = css.match(/\.image-lightbox \{[^}]*\}/);
  assert.ok(block, '应存在 .image-lightbox 规则');
  assert.ok(!block[0].includes('rgba(0, 0, 0, 0.85)'), '亮色默认不应是深色背景');
  assert.match(block[0], /background: rgba\(243, 244, 246, 0\.94\)/, '亮色应为浅灰背景');
});

test('暗色主题覆盖 image-lightbox 为深色（保持现状）', () => {
  assert.ok(
    /\[data-theme="dark"\] \.image-lightbox \{[^}]*rgba\(0, 0, 0, 0\.85\)/.test(css),
    '暗色应覆盖为深色背景 rgba(0,0,0,0.85)',
  );
});

test('lightbox-hint 亮色深字浅底、暗色白字深底', () => {
  const light = css.match(/\.lightbox-hint \{[^}]*\}/);
  assert.ok(light, '应存在 .lightbox-hint 规则');
  assert.match(light[0], /background: rgba\(255, 255, 255, 0\.85\)/, '亮色 hint 应为浅色底');
  assert.ok(
    /\[data-theme="dark"\] \.lightbox-hint \{[^}]*rgba\(0, 0, 0, 0\.55\)/.test(css),
    '暗色 hint 应为深色底',
  );
});
