// P2-3 vendor 锁定（沿用 5f5b23e 范式）
//
// 从 node_modules 把 5 个运行时依赖（已在 dependencies）复制到 src/lib 的 vendor 子树，
// 使「vendor 文件」成为可由 node_modules 确定性再生的产物，而非手改的游离副本。
// 比「删 src/lib 改 npm 导入」更可逆：index.html 的 <script> 路径不变，只是内容改为由本脚本生成。
//
// 接入点：
//   - package.json "prepare"：npm install / npm ci 后自动重建 vendor（CI 用完整安装）。
//
// 重要例外 —— highlight.js：
//   node_modules 的 highlight.js 包【不发布浏览器 UMD 版 highlight.min.js】（全局 hljs），
//   且当前 vendored 的 highlight.min.js 是 v11.9.0 的官网全量构建；用 esbuild 从 node_modules
//   现打包会得到 11.11.1 且行为差异导致 code-block 测试 4 例退化。故 highlight.js 整套
//   （highlight.min.js + common.js/core.js/languages/styles）保持 git 追踪、钉死在可用版本，
//   不纳入本脚本再生，避免静默破坏高亮。其版本一致性由 package.json 的声明约束。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'src', 'lib');
const NM = path.join(ROOT, 'node_modules');

// 复制：src 文件 -> dest 文件；src 目录 -> dest 目录（递归）。
function copyPath(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src)) {
      if (ent === 'node_modules' || ent === '.bin') continue;
      copyPath(path.join(src, ent), path.join(dest, ent));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// 显式 manifest：node_modules 源 -> src/lib 目标。目录会被整体递归复制。
// 仅含「映射干净、版本与 package.json 完全一致」的 5 个库；highlight.js 见上说明，已排除。
const MANIFEST = [
  // codemirror（npm 包根有 mode/addon/theme，核心在 lib/）
  ['codemirror/lib/codemirror.js', 'codemirror/codemirror.js'],
  ['codemirror/lib/codemirror.css', 'codemirror/codemirror.css'],
  ['codemirror/mode', 'codemirror/mode'],
  ['codemirror/addon', 'codemirror/addon'],
  ['codemirror/theme', 'codemirror/theme'],
  // katex
  ['katex/dist/katex.min.js', 'katex/katex.min.js'],
  ['katex/dist/katex.min.css', 'katex/katex.min.css'],
  ['katex/dist/contrib/auto-render.min.js', 'katex/auto-render.min.js'],
  ['katex/dist/fonts', 'katex/fonts'],
  // mermaid
  ['mermaid/dist/mermaid.min.js', 'mermaid/mermaid.min.js'],
  // html2canvas（单文件）
  ['html2canvas/dist/html2canvas.min.js', 'html2canvas.min.js'],
  // markdown-it（单文件）
  ['markdown-it/dist/markdown-it.min.js', 'markdown-it.min.js'],
];

let missing = 0;
for (const [relSrc, relDest] of MANIFEST) {
  const src = path.join(NM, relSrc);
  const dest = path.join(LIB, relDest);
  if (!fs.existsSync(src)) {
    console.error(`[ensure-vendor] 缺失源：${relSrc}（node_modules 未安装？）`);
    missing++;
    continue;
  }
  copyPath(src, dest);
}

if (missing > 0) {
  console.error(`[ensure-vendor] 有 ${missing} 个源缺失，vendor 不完整。请先 npm install。`);
  process.exit(1);
}

console.log('[ensure-vendor] vendor 同步完成：src/lib（codemirror/katex/mermaid/html2canvas/markdown-it；highlight.js 保持追踪）');
