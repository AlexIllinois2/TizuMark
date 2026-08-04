// 复现测试：相邻公式都含 | 时，第一个不应被误判为表格列分隔符
const test = require('node:test');
const assert = require('node:assert');
const { protectUnpairedDollar } = require('../src/modules/preview-post.js');

test('【bug 复现】相邻多个含 | 的成对公式全部应保留不包裹', async () => {
  // 用户的实际场景：两个相邻公式都含 k|x 这类数学符号
  const s = '$F\\hat{x}_{k-1|k-1}$ $\\hat{x}_{k|k-1}={E[x_k|z_{1:k-1}]=E[Fx_{k-1}+w_k|z_{1:k-1}]}$';
  const r = protectUnpairedDollar(s);
  console.log('input :', JSON.stringify(s));
  console.log('output:', JSON.stringify(r));
  // 期望：成对公式保持原样，不被包 ignore span
  assert.ok(!r.includes('katex-ignore'), '相邻成对公式不应被包 ignore span');
  assert.strictEqual(r, s);
});

test('【bug 复现】用户原句：一行中 3 个内嵌公式全部应保留', async () => {
  const s = '你可能会问:正文步骤 1 直接写 $\\hat{x}_{k|k-1}={E[x_k|z_{1:k-1}]=E[Fx_{k-1}+w_k|z_{1:k-1}]}$, 一步就到了 $F\\hat{x}_{k-1|k-1}$, 为什么还要绕 CK 积分?';
  const r = protectUnpairedDollar(s);
  console.log('input :', JSON.stringify(s));
  console.log('output:', JSON.stringify(r));
  assert.ok(!r.includes('katex-ignore'), '全部内嵌公式应保留不包裹');
  assert.strictEqual(r, s);
});

test('对照：紧邻表格列分隔符的 $ 仍应被包 span', async () => {
  // " | " 形态的竖线表明这是表格列
  const s = '|  $x  |';
  const r = protectUnpairedDollar(s);
  console.log('input :', JSON.stringify(s));
  console.log('output:', JSON.stringify(r));
  // 这里没有配对的 $，应当被包 span
  assert.ok(r.includes('katex-ignore'), '孤立 $ 仍应被包 span');
});
