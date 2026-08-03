// 极简静态 dev server：serve src/，供 Tauri dev（devUrl）使用。
//
// ADR-4 完整切换的一部分：Tauri v2 未设 devUrl 时 dev/release 共用 frontendDist，
// 无法按环境分离。设置 devUrl 后 dev 模式加载本 server 提供的 src/ 源码
// （改完即刷、无需打包），release 仍加载 frontendDist（../dist 打包产物）。
//
// 增强（热加载 + 端口自愈）：
//  - LiveReload：用 SSE（/__livereload，纯 HTTP 流，无需 ws 依赖、无需改 CSP）
//    监听 src/ 文件变化，自动刷新 webview。比重构前多了真·热加载。
//  - 端口自愈：若 1420 被「残留的旧 dev-server」占用（上次关应用没杀干净），
//    自动 taskkill 该进程后重试监听，避免静默连上旧 server 导致「跑旧代码」。
//
// 用法：tauri.conf.json build.beforeDevCommand = "node scripts/dev-server.mjs"
// 端口：PORT 环境变量可覆盖，默认 1420（Tauri 官方模板惯例）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'src');
const PORT = Number(process.env.PORT || 1420);
const LIVERELOAD_PATH = '/__livereload';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

// ---- LiveReload：SSE 客户端集合 + 文件监听 ----
const sseClients = new Set();
let reloadTimer = null;
function broadcastReload() {
  for (const res of sseClients) {
    try { res.write('data: reload\n\n'); } catch { /* 已断开，下次清理 */ }
  }
}

// 渲染器是预打包 bundle（src/lib/unified-bundle.js），dev/webview 实际加载的是它，
// 不是 src/unified-renderer.js 源码。因此源码改动后必须「重新打包」才能让热加载生效——
// 否则刷新后还是旧 bundle（这正是之前「改渲染器不动」的根因）。这里在 watcher 里
// 自动重打包，开发期改源码即热更新，无需手动 npm run build:renderer。
const RENDERER_ENTRY = path.join(ROOT, 'unified-renderer.js');
const BUNDLE_OUT = path.join(ROOT, 'lib', 'unified-bundle.js');
const isRendererSource = (f) => /[\\/]unified-renderer\.js$/.test(f);
const isBundle = (f) => /[\\/]unified-bundle\.js$/.test(f);

async function rebuildRendererBundle(reason) {
  try {
    await build({
      entryPoints: [RENDERER_ENTRY],
      outfile: BUNDLE_OUT,
      bundle: true,
      format: 'iife',
      globalName: 'UnifiedRenderer',
      platform: 'browser',
      target: ['es2020'],
      legalComments: 'none',
      logLevel: 'silent',
    });
    console.log('[dev-server] 渲染器已重打包（' + reason + '）→ 即将热更新');
  } catch (e) {
    console.error('[dev-server] 渲染器打包失败：', e && e.message);
  }
}

let pendingExtra = null;
function scheduleReload(extra) {
  if (extra) pendingExtra = extra;
  if (reloadTimer) return; // 合并编辑器连写
  reloadTimer = setTimeout(async () => {
    reloadTimer = null;
    if (pendingExtra) {
      try { await pendingExtra(); } catch (_) { /* 失败已记录，仍刷新以免卡死 */ }
      pendingExtra = null;
    }
    broadcastReload();
  }, 60);
}
try {
  fs.watch(ROOT, { recursive: true }, (event, filename) => {
    if (!filename) return;
    if (/(^|[\\/])\.|~$/.test(filename)) return; // 跳过临时文件
    if (isBundle(filename)) return; // 忽略我们自己产出的 bundle，避免重复刷新
    if (isRendererSource(filename)) {
      // 渲染器源码改动：先重新打包 bundle，再热加载 webview
      scheduleReload(() => rebuildRendererBundle(filename));
    } else {
      scheduleReload();
    }
  });
} catch (e) {
  console.error('[dev-server] 文件监听失败（热加载将不可用）：', e && e.message);
}
// 心跳保活（防止中间层超时断开 SSE）
setInterval(() => { for (const res of sseClients) { try { res.write(': ping\n\n'); } catch {} } }, 15000);

const LIVERELOAD_SNIPPET = `<script>(function(){try{var es=new EventSource('${LIVERELOAD_PATH}');es.onmessage=function(){location.reload();};es.onerror=function(){};}catch(e){}})();</script>`;

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch (_) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }

  // LiveReload SSE 端点（虚拟路由，不参与文件遍历守卫）
  if (urlPath === LIVERELOAD_PATH) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  const file = path.normalize(path.join(ROOT, urlPath));
  // 防目录穿越：归一化后必须仍在 src/ 内
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    // HTML：注入 LiveReload 客户端（src/index.html 本身保持生产干净，仅 dev 注入）
    if (ext === '.html') {
      let html = data.toString('utf8');
      if (html.includes('</head>')) html = html.replace('</head>', LIVERELOAD_SNIPPET + '</head>');
      else if (html.includes('</body>')) html = html.replace('</body>', LIVERELOAD_SNIPPET + '</body>');
      else html += LIVERELOAD_SNIPPET;
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(Buffer.from(html, 'utf8'));
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

// 端口自愈：残留旧 dev-server 占住 1420 时自动清理并重试，避免静默连旧代码
function getPortOwnerCmd(port) {
  try {
    const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
    const line = net.split(/\r?\n/).find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
    if (!line) return null;
    const pid = line.trim().split(/\s+/).pop();
    if (!pid || !/^\d+$/.test(pid)) return null;
    const tl = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout || '';
    const name = (tl.split(',')[0] || '').replace(/^"|"$/g, '') || 'unknown';
    const wmic = spawnSync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/VALUE'], { encoding: 'utf8' }).stdout || '';
    const cmd = (wmic.split('CommandLine=')[1] || '').trim();
    return { pid, name, cmd };
  } catch (_) {
    return null;
  }
}

let listenRetries = 0;
function start() {
  server.listen(PORT, () => {
    console.log(`[dev-server] serving ${ROOT} at http://localhost:${PORT}  (LiveReload: SSE ${LIVERELOAD_PATH})`);
  });
}
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && listenRetries < 1) {
    const owner = getPortOwnerCmd(PORT);
    if (owner && /dev-server\.mjs/.test(owner.cmd || '')) {
      listenRetries++;
      console.error(`[dev-server] 端口 ${PORT} 被残留的旧 dev-server 占用（PID ${owner.pid}），自动清理后重试...`);
      spawnSync('taskkill', ['/F', '/PID', String(owner.pid)], { stdio: 'ignore' });
      setTimeout(start, 1000);
    } else {
      console.error(`[dev-server] 端口 ${PORT} 被占用（${owner ? owner.name + ' PID ' + owner.pid : 'unknown'}），且非本 dev-server，无法自动清理。`);
      console.error(`[dev-server] 请手动结束占用进程后重试：` + (owner ? ` taskkill /F /PID ${owner.pid}` : ''));
      process.exit(1);
    }
  } else {
    console.error('[dev-server] 启动失败：', err && err.message);
    process.exit(1);
  }
});
start();
