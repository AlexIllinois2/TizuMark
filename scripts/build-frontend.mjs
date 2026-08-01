// 前端 release 产物编排（ADR-4 的安全落地版本）。
//
// 背景 / 为何这样实现：
//   ADR-4 的目标是让 release 输出到 dist/、dev 仍走 src/，从而 release 产物可独立于
//   源码树，并在打包后移除 CSP 的 unsafe-eval。但本项目当前前端是「经典 <script> 全局模式」
//   （src/app.js 等以普通 <script> 加载，依赖 window.CodeMirror / window.hljs / window.katex
//   等浏览器全局，并非 ESM 模块图），且 Tauri 没有 dev server —— 在未配置 devUrl 时，
//   Tauri v2 的 dev 与 release 共用 build.frontendDist（当前为 ../src）。
//
//   因此「release 用 dist/ 且 dev 仍 src/」的真正切换，必须先引入 dev server + 前端 ESM 化，
//   这是超出本次范围的更大重构。本脚本采用零架构风险的「资源聚合拷贝」：把 src/ 整棵前端树
//   （含已生成的 unified-bundle.js 与 vendor 库）聚合到 dist/，作为 release 产物目录。
//   tauri.conf.json 的 frontendDist 本次保持不变（仍 ../src），确保现有 dev/release 链路
//   行为零改动；后续若要做完整 ADR-4 切换，只需把 frontendDist 指向 ../dist 并补 dev server。
//
// 前置：必须先 npm run build:renderer（生成 src/lib/unified-bundle.js），否则预览渲染会白屏。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const assetsDir = path.join(root, 'assets');

function fail(msg) {
  console.error('[build-frontend] ✗ ' + msg);
  process.exit(1);
}

// 前置校验：unified-bundle 必须已生成（否则预览渲染会白屏）。
if (!fs.existsSync(path.join(srcDir, 'lib', 'unified-bundle.js'))) {
  fail('src/lib/unified-bundle.js 不存在，请先运行 `npm run build:renderer`');
}
if (!fs.existsSync(path.join(srcDir, 'index.html'))) {
  fail('src/index.html 缺失，无法编排前端');
}

// 清理旧 dist，避免残留过期文件。
fs.rmSync(distDir, { recursive: true, force: true });

let copied = 0;
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(s, d);
    } else {
      fs.copyFileSync(s, d);
      copied += 1;
    }
  }
}

copyTree(srcDir, distDir);
// 顶层 assets（图标等）一并带进 dist，保证 release 产物自包含。
if (fs.existsSync(assetsDir)) {
  copyTree(assetsDir, path.join(distDir, 'assets'));
}

console.log(
  `✓ 前端已编排到 dist/（拷贝 ${copied} 个文件，含已生成的 unified-bundle.js 与 vendor 库）。\n` +
    '  当前 tauri.conf.json 的 frontendDist 仍为 ../src（dev/release 行为不变）。\n' +
    '  若要做完整 ADR-4 切换，把 frontendDist 改为 ../dist 并补 dev server 即可。'
);
