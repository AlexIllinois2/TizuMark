// 极简静态 dev server：serve src/，供 Tauri dev（devUrl）使用。
//
// ADR-4 完整切换的一部分：Tauri v2 未设 devUrl 时 dev/release 共用 frontendDist，
// 无法按环境分离。设置 devUrl 后 dev 模式加载本 server 提供的 src/ 源码
// （改完即刷、无需打包），release 仍加载 frontendDist（../dist 打包产物）。
//
// 用法：tauri.conf.json build.beforeDevCommand = "node scripts/dev-server.mjs"
// 端口：PORT 环境变量可覆盖，默认 1420（Tauri 官方模板惯例）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'src');
const PORT = Number(process.env.PORT || 1420);

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

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch (_) {
    res.writeHead(400);
    res.end('bad request');
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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[dev-server] serving ${ROOT} at http://localhost:${PORT}`);
});

// 端口被占用时的可操作报错：解析出占用进程 PID/名字，给出可直接复制的 taskkill 命令。
// 典型场景：上一次 npm run dev 被中断，dev server 进程残留，端口仍被 LISTENING。
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    const owner = findPortOwner(PORT);
    console.error(`[dev-server] 端口 ${PORT} 已被占用${owner ? `（PID ${owner.pid}：${owner.name}）` : ''}`);
    console.error('[dev-server] 这通常是上一次 dev 退出后遗留的进程，请先执行：');
    if (owner) console.error(`[dev-server]   taskkill /F /PID ${owner.pid}`);
    console.error('[dev-server] 然后重新运行 npm run dev。');
  } else {
    console.error('[dev-server] 启动失败：', err && err.message);
  }
  process.exit(1);
});

function findPortOwner(port) {
  try {
    const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
    const line = net.split(/\r?\n/).find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
    if (!line) return null;
    const pid = line.trim().split(/\s+/).pop();
    if (!pid || !/^\d+$/.test(pid)) return null;
    const tl = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout || '';
    // CSV 列序：Image Name, PID, Session Name, Session#, Mem Usage → 名字在第 0 列
    const name = (tl.split(',')[0] || '').replace(/^"|"$/g, '') || 'unknown';
    return { pid, name };
  } catch (_) {
    return null;
  }
}
