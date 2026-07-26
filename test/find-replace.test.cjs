// isSafeRegex 单元测试：锁定 ReDoS 防护行为（从 app.js initFindReplace 抽出）。
const test = require('node:test');
const assert = require('node:assert');
const { isSafeRegex } = require('../src/modules/find-replace.js');

test('普通正则/字面量视为安全', async () => {
  assert.strictEqual(isSafeRegex('abc'), true);
  assert.strictEqual(isSafeRegex('a+b'), true);
  assert.strictEqual(isSafeRegex('\\d{3}-\\d{4}'), true);
  assert.strictEqual(isSafeRegex('foo.*bar'), true);
  assert.strictEqual(isSafeRegex(''), true);
});

test('超长（>500）视为不安全', async () => {
  assert.strictEqual(isSafeRegex('a'.repeat(501)), false);
  assert.strictEqual(isSafeRegex('a'.repeat(500)), true);
});

test('嵌套/相邻量词视为不安全（ReDoS）', async () => {
  assert.strictEqual(isSafeRegex('(a+)+'), false);
  assert.strictEqual(isSafeRegex('a*+'), false);
  assert.strictEqual(isSafeRegex('(a*)*'), false);
});

test('重复捕获组 (a+)(a+) 视为不安全', async () => {
  // 注意：原实现仅拦截「组内含量词且完全相同的重复组」，\1 反向引用需完全匹配
  assert.strictEqual(isSafeRegex('(a+)(a+)'), false);
  // 不同内容的量词组（a+)(b+) 不构成反向引用，视为安全
  assert.strictEqual(isSafeRegex('(a+)(b+)'), true);
  assert.strictEqual(isSafeRegex('(a)(b)'), true);
});

test('量词后紧跟捕获组 a*(...) 视为不安全', async () => {
  assert.strictEqual(isSafeRegex('a*(b)'), false);
  // 非捕获组 (?:) 允许
  assert.strictEqual(isSafeRegex('a*(?:b)'), true);
});

test('断言后接量词视为不安全', async () => {
  assert.strictEqual(isSafeRegex('(?=a)*'), false);
  assert.strictEqual(isSafeRegex('(?!a)+'), false);
});

test('超长字符序列后接量词视为不安全', async () => {
  assert.strictEqual(isSafeRegex('abcdefghij*'), false);
  assert.strictEqual(isSafeRegex('abcde*'), true);
});

test('非字符串输入视为不安全', async () => {
  assert.strictEqual(isSafeRegex(null), false);
  assert.strictEqual(isSafeRegex(undefined), false);
  assert.strictEqual(isSafeRegex(123), false);
});

test('与旧实现逐字符一致（回归）', async () => {
  const samples = [
    'abc', '', 'a+', '(a+)+', 'a{2,3}', '\\d+', '(foo|bar)', '.+?',
    'a'.repeat(500), 'a'.repeat(501), '(a)(a)', 'a*(b)', '(?=x)+', 'x{1,2}?',
  ];
  function oldIsSafeRegex(q) {
    if (typeof q !== 'string' || q.length > 500) return false;
    if (/[+*?}]\)[\s]*[+*{]|[+*}]\s*[+*{]/.test(q)) return false;
    if (/(\([^()]*[+*?][^()]*\))\1/.test(q)) return false;
    if (/[+*?]\s*\((?!\?)/.test(q)) return false;
    if (/\(\?[=!:].*\)\s*[+*?]/.test(q)) return false;
    if (/(.\s*.\s*.\s*.\s*.\s*.\s*.\s*.\s*.\s*.\s*)\*/.test(q)) return false;
    return true;
  }
  for (const s of samples) {
    assert.strictEqual(isSafeRegex(s), oldIsSafeRegex(s), 'sample=' + JSON.stringify(s));
  }
});
