// 从单一真相源 src/unified-renderer.js 自动构建浏览器 / webview 运行时 bundle。
//
// 背景：Tauri 的 webview（WebView2）没有 Node 的 require，无法直接加载
// unified-renderer.js（它 require 了 unified / remark-* / rehype-* 等数十个 npm 包）。
// 因此必须把这些依赖 + 渲染器打包成一个暴露全局变量 UnifiedRenderer 的脚本，
// 由 index.html 以 <script src="lib/unified-bundle.js"> 加载。
//
// 历史坑：bundle 曾经是手工维护的源码副本，频繁与 unified-renderer.js 脱节——
// 例如 ace51bb「防 XSS」提交只在源码里加了 rehype-sanitize，却忘了重新打包，
// 导致发布版桌面端实际跑的是漏掉安全修复的旧 bundle（XSS 防护静默失效）。
//
// 现在改为自动构建：npm run build:renderer（已接入 dev / build），
// 单一真相源是 unified-renderer.js，bundle 永远自动重新生成，杜绝漂移。
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await build({
  entryPoints: [path.join(root, 'src/unified-renderer.js')],
  outfile: path.join(root, 'src/lib/unified-bundle.js'),
  bundle: true,
  format: 'iife',
  globalName: 'UnifiedRenderer',
  platform: 'browser',
  target: ['es2020'],
  legalComments: 'none',
  logLevel: 'info',
});

console.log('✓ src/lib/unified-bundle.js 已从 src/unified-renderer.js 自动重建');
