// 测试运行器：每个 test 文件在【独立的 Node 进程】中运行。
//
// 为什么需要它：node:test 在单次 `node --test test/*.test.cjs` 调用下会把所有 test 文件
// 放进【同一个进程】并发执行，而各测试文件共享 global.window/document/navigator，并且
// codemirror 是 require 缓存单例 —— 并发时互相踩踏，导致 outline / file-watcher / tauri
// 等用例“漂移”式间歇性失败（同一批跑有时过、有时挂在不同文件）。把每个文件拆到独立进程
// 后，进程内各 test 顺序执行（node:test 同文件内串行）、进程间全局互不干扰，从根本消除串扰。
//
// 用法（package.json 的 test 脚本已指向它）：node scripts/run-tests.cjs

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'test');
const PER_FILE_TIMEOUT = 120; // 单文件超时（秒），避免某个用例死等导致整批卡死

function listTestFiles() {
  return fs.readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.cjs'))
    .map((f) => path.join(TEST_DIR, f))
    .sort();
}

function runOne(file) {
  // --test-concurrency=1：同文件内子测试串行执行，避免并发 buildEnv 互相踩踏共享的
  // global.window/document 与 codemirror 单例（每个文件已是独立进程，仅剩文件内并发问题）。
  const res = spawnSync(process.execPath, ['--test', '--test-concurrency=1', file], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: PER_FILE_TIMEOUT * 1000,
    killSignal: 'SIGKILL',
  });
  const out = (res.stdout || '') + (res.stderr || '');
  const tests = /(?:^|\n)# tests\s+(\d+)/.exec(out);
  const pass = /(?:^|\n)# pass\s+(\d+)/.exec(out);
  const fail = /(?:^|\n)# fail\s+(\d+)/.exec(out);
  const timedOut = res.error && res.error.code === 'ETIMEDOUT';
  const failed = timedOut || /(?:^|\n)not ok\b/.test(out) || res.status !== 0;
  return {
    file: path.basename(file),
    status: res.status,
    tests: tests ? Number(tests[1]) : null,
    pass: pass ? Number(pass[1]) : null,
    fail: fail ? Number(fail[1]) : null,
    timedOut: !!timedOut,
    failed,
    output: out,
  };
}

function summarize(results) {
  const total = results.length;
  const failedFiles = results.filter((r) => r.failed);
  const totalTests = results.reduce((a, r) => a + (r.tests || 0), 0);
  const totalPass = results.reduce((a, r) => a + (r.pass || 0), 0);
  const totalFail = results.reduce((a, r) => a + (r.fail || 0), 0);

  console.log('\n================ 测试汇总 ================');
  for (const r of results) {
    const mark = r.failed ? 'FAIL' : 'ok  ';
    let detail;
    if (r.timedOut) detail = `超时(>${PER_FILE_TIMEOUT}s)被杀`;
    else if (r.tests != null) detail = `${r.pass}/${r.tests} passed`;
    else detail = `exit=${r.status}`;
    console.log(`  [${mark}] ${r.file}  (${detail})`);
  }
  console.log('------------------------------------------');
  console.log(`  文件: ${total - failedFiles.length}/${total} 通过`);
  console.log(`  用例: ${totalPass}/${totalTests} 通过, ${totalFail} 失败`);
  console.log('==========================================\n');

  if (failedFiles.length) {
    console.error(`✗ ${failedFiles.length} 个测试文件存在失败：`);
    for (const r of failedFiles) {
      console.error(`  - ${r.file}${r.timedOut ? ' (超时)' : ''}`);
      // 打印失败文件的完整 TAP 输出，便于定位具体子测试与错误
      if (r.output) {
        console.error('---- ' + r.file + ' 输出 ----');
        console.error(r.output);
      }
    }
    process.exit(1);
  }
  console.log('✓ 全部测试文件通过');
}

function runSequential(files) {
  const results = [];
  let i = 0;
  for (const f of files) {
    i++;
    process.stdout.write(`[${i}/${files.length}] ${path.basename(f)} ... `);
    const r = runOne(f);
    const tag = r.timedOut ? 'TIMEOUT' : (r.failed ? 'FAIL' : 'ok');
    const detail = r.tests != null ? `${r.pass}/${r.tests}` : (r.timedOut ? 'timeout' : `exit=${r.status}`);
    console.log(`${tag} (${detail})`);
    results.push(r);
  }
  return results;
}

function main() {
  const files = listTestFiles();
  if (!files.length) {
    console.error('未找到任何 test/*.test.cjs');
    process.exit(1);
  }
  console.log(`运行 ${files.length} 个测试文件（每文件独立进程，串行）...\n`);
  const results = runSequential(files);
  summarize(results);
}

main();
