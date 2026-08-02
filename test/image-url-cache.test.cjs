// P1-4（2026-08-01 审查修复）：_imageURLCache Blob URL LRU 容量上限测试。
// 覆盖：① 命中缓存返回同一 URL 且刷新 LRU 序；② 超限 revoke 最久未用的 Blob URL；
//        ③ beforeunload 全量 revoke。
// 注：jsdom 未实现 URL.createObjectURL/revokeObjectURL，测试 stub 之。

const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

// 合法 base64（PNG 头），保证 atob 可解码
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const P1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=';
const P2 = 'data:image/png;base64,iVBORw0KGgoAAAABCAYAAA';
const P3 = 'data:image/png;base64,iVBORw0KGgoAAAABCAYAAAA';

test('getCachedImageURL: 命中缓存复用同一 URL', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  const origCreate = w.URL.createObjectURL;
  const origRevoke = w.URL.revokeObjectURL;
  let count = 0;
  w.URL.createObjectURL = () => 'blob:mock-' + (count++);
  w.URL.revokeObjectURL = () => {};
  try {
    const first = ed.getCachedImageURL(PNG);
    const second = ed.getCachedImageURL(PNG);
    assert.strictEqual(first, second, '同一 dataUri 应复用同一 Blob URL');
    assert.strictEqual(count, 1, '只应创建一次');
  } finally {
    w.URL.createObjectURL = origCreate;
    w.URL.revokeObjectURL = origRevoke;
  }
}));

test('getCachedImageURL: 超限 revoke 最久未用的 URL（LRU）', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed._imageURLCacheMax = 3;
  const origCreate = w.URL.createObjectURL;
  const origRevoke = w.URL.revokeObjectURL;
  const created = [];
  const revoked = [];
  w.URL.createObjectURL = () => { const u = 'blob:mock-' + created.length; created.push(u); return u; };
  w.URL.revokeObjectURL = (u) => revoked.push(u);
  try {
    ed.getCachedImageURL(PNG);
    ed.getCachedImageURL(P1);
    ed.getCachedImageURL(P2);
    // 访问 PNG 刷新 LRU 序（PNG 最新，P1 最旧）
    ed.getCachedImageURL(PNG);
    ed.getCachedImageURL(P3);
    assert.strictEqual(ed._imageURLCache.size, 3, '容量应钳制在 3');
    assert.deepStrictEqual(revoked, ['blob:mock-1'], '应 revoke 最久未用的 P1（mock-1）');
    // 刷新过的 PNG 仍可用
    assert.strictEqual(ed.getCachedImageURL(PNG), 'blob:mock-0');
  } finally {
    w.URL.createObjectURL = origCreate;
    w.URL.revokeObjectURL = origRevoke;
  }
}));

test('getCachedImageURL: beforeunload 全量 revoke', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  const origCreate = w.URL.createObjectURL;
  const origRevoke = w.URL.revokeObjectURL;
  const revoked = [];
  w.URL.createObjectURL = () => 'blob:mock-u';
  w.URL.revokeObjectURL = (u) => revoked.push(u);
  try {
    ed.getCachedImageURL(PNG);
    ed.getCachedImageURL(P1);
    w.dispatchEvent(new w.Event('beforeunload'));
    assert.strictEqual(revoked.length, 2, '退出时应全量 revoke');
    assert.strictEqual(ed._imageURLCache.size, 0, '退出后缓存应清空');
  } finally {
    w.URL.createObjectURL = origCreate;
    w.URL.revokeObjectURL = origRevoke;
  }
}));
