// loading 遮罩主题切换平滑策略的静态契约测试。
// 需求：切换全程用户盯着遮罩，不能"黑白瞬间跳变"，也不能卡顿。
// 策略：遮罩背景由 JS 固定为切换前主题色（不跳变）；淡出用 opacity（合成器属性，
// 不占主线程，mermaid 渲染期间也流畅）。禁止 background-color 渐变（主线程 repaint，
// 会被同步渲染阻塞导致跳帧卡顿）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

test('loading-overlay 淡出用 opacity 过渡，且不做 background-color 渐变', () => {
  const block = css.match(/\.loading-overlay \{[^}]*\}/);
  assert.ok(block, '应存在 .loading-overlay 规则');
  assert.match(block[0], /transition: opacity 0\.3s ease/, '淡出应走 opacity（合成器属性）');
  assert.ok(!/transition: background-color/.test(block[0]), '不应做 background-color 渐变（主线程 repaint 会被渲染阻塞卡顿）');
});
