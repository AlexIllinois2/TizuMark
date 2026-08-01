// P2-1（2026-08-01 审查修复）：版本号一致性校验脚本测试。
// 覆盖：① 当前各文件版本号一致时 exit 0；② 篡改任一文件版本号后 exit 1 并定位；
//        ③ 恢复后重新通过（try/finally 保证恢复）。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHECK = path.join(ROOT, 'scripts', 'check-version.mjs');
const CARGO = path.join(ROOT, 'src-tauri', 'Cargo.toml');

function runCheck() {
  try {
    const out = execFileSync(process.execPath, [CHECK], { stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

test('check-version: 版本号一致时通过', () => {
  const r = runCheck();
  assert.strictEqual(r.ok, true, '当前版本应一致：' + r.out);
  assert.ok(r.out.includes('版本号一致'), '应输出通过信息');
});

test('check-version: 篡改一处版本号即失败并定位', () => {
  const orig = fs.readFileSync(CARGO, 'utf8');
  let restored = false;
  try {
    const tampered = orig.replace(/^version\s*=\s*"([^"]+)"/m, 'version = "99.99.99"');
    assert.notStrictEqual(tampered, orig, '测试前提：篡改应生效');
    fs.writeFileSync(CARGO, tampered);
    const r = runCheck();
    assert.strictEqual(r.ok, false, '篡改后应失败');
    assert.ok(r.out.includes('Cargo.toml'), '应定位到 Cargo.toml：' + r.out);
    restored = true;
  } finally {
    fs.writeFileSync(CARGO, orig);
    restored = true;
  }
  assert.ok(restored, 'Cargo.toml 已恢复');
  const r2 = runCheck();
  assert.strictEqual(r2.ok, true, '恢复后应重新通过：' + r2.out);
});
