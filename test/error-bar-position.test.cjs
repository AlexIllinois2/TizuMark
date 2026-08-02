// 错误条位置测试（用户报告：所有报错条不得遮挡窗口控制按钮/菜单）。
// 覆盖：① index.html 的 showErrorBar → fixed bottom，② 不再插入 #app 内部顶部（那里会压住 max/min/close 与工具栏菜单）。
// 注：app-env 用 runScripts: 'outside-only' 不执行 index.html 内联 IIFE，
// 测试里手动 eval IIFE 文本到 jsdom window（注册 window.__errorBar + listeners）以验证位置策略。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { withEditor } = require('./helpers/app-env.cjs');

// 读取 index.html 第一个含 showErrorBar 的 <script> 块（IIFE + listeners 注册）。
// 注意：index.html 17 行注释里也有 "<script>" 字面，所以不能用首个 <script> 简单匹配。
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const errorScript = indexHtml.split('<script>').find((p) => p.includes('showErrorBar')).split('</script>')[0];
if (!errorScript) throw new Error('index.html 未找到含 showErrorBar 的 <script> 块');

test('__errorBar: 错误条 fixed bottom，不遮挡窗口控制按钮与菜单', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  // 手动执行 IIFE：注册 window.__errorBar（等价于 unhandledrejection/error 触发路径）
  new w.Function(errorScript).call(w);
  assert.strictEqual(typeof w.__errorBar, 'function', 'IIFE 应导出 __errorBar');

  w.__errorBar('test rejection: simulating dialog.confirm not allowed. Command not found', 'error');
  const bar = w.document.getElementById('fatal-error-bar');
  assert.ok(bar, '应创建错误条');
  assert.strictEqual(bar.style.position, 'fixed', '必须 fixed 定位（不能 absolute/relative 随文档流）');
  // jsdom 规范化为 '0px'；用 endsWith 容忍 px 后缀
  assert.ok(/^0(px)?$/.test(bar.style.bottom), '必须贴底（不挡窗口控制按钮与顶部菜单）');
  assert.ok(/^0(px)?$/.test(bar.style.left));
  assert.ok(/^0(px)?$/.test(bar.style.right));
  // 关键：不得插入 #app 内部（那会变成顶部条，挡住工具栏菜单）
  const app = w.document.getElementById('app');
  assert.strictEqual(app.contains(bar), false, '错误条不得在 #app 内部（历史 bug：插入 app.firstChild 挡菜单）');
  // 顶部位置绝不能出现
  assert.notStrictEqual(bar.style.top, '0px', '不得固定到顶部');
  assert.notStrictEqual(bar.style.top, '0', '不得固定到顶部');
  // 必须有手动关闭 × 按钮
  assert.ok(bar.querySelector('button'), '应提供关闭按钮');
}));

test('__errorBar: warn 级别也走 fixed bottom（与 error 同位置策略）', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  new w.Function(errorScript).call(w);
  w.__errorBar('warning test', 'warn');
  const bar = w.document.getElementById('fatal-error-bar');
  assert.ok(bar);
  assert.strictEqual(bar.style.position, 'fixed');
  assert.ok(/^0(px)?$/.test(bar.style.bottom));
  // warn 前缀应出现（区分 error 级别）
  assert.ok(/⚠️ 警告/.test(bar.innerHTML) || /⚠/.test(bar.textContent), 'warn 级别应有警告前缀');
}));