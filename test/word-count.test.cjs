// 字数统计单元测试：锁定 countStats 的纯计算行为（与 app.js 旧实现一致）。
const test = require('node:test');
const assert = require('node:assert');
const { countStats } = require('../src/modules/word-count.js');

test('空内容统计为 0', async () => {
  assert.deepStrictEqual(countStats(''), { words: 0, chars: 0, lines: 0 });
  assert.deepStrictEqual(countStats(null), { words: 0, chars: 0, lines: 0 });
  assert.deepStrictEqual(countStats(undefined), { words: 0, chars: 0, lines: 0 });
});

test('纯文本词数按空白分词', async () => {
  const r = countStats('hello world foo');
  assert.strictEqual(r.words, 3);
  assert.strictEqual(r.chars, 15); // 含两个空格
  assert.strictEqual(r.lines, 1);
});

test('多行按 \\n 计行数', async () => {
  const r = countStats('line one\nline two\nline three');
  assert.strictEqual(r.lines, 3);
  assert.strictEqual(r.words, 6);
});

test('markdown 标记符号不计入词数', async () => {
  // # * ` ~ [ ] ( ) > _ | \ - 均被去除后再分词
  const r = countStats('# 标题 **加粗** `代码` [链接](url)');
  // 去除标记后：标题 加粗 代码 链接url（[ ] ( ) 被去，链接url 连成一词）-> 4 词
  assert.strictEqual(r.words, 4);
  // chars 仍是原始字符数
  assert.strictEqual(r.chars, '# 标题 **加粗** `代码` [链接](url)'.length);
});

test('首尾/连续空白被规整', async () => {
  const r = countStats('   word1   word2   ');
  assert.strictEqual(r.words, 2);
});

test('与旧实现逐字符一致（回归）', async () => {
  const samples = [
    '',
    'abc',
    'a b c',
    '# 标题\n\n正文内容在这里。\n\n- 列表项一\n- 列表项二',
    '```js\nconst x = [1,2];\n```',
  ];
  for (const s of samples) {
    const text = s.replace(/[#*`~\[\]()>_|\\-]/g, '').replace(/\s+/g, ' ').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = s.length;
    const lines = s ? s.split('\n').length : 0;
    assert.deepStrictEqual(countStats(s), { words, chars, lines }, 'sample=' + JSON.stringify(s));
  }
});
