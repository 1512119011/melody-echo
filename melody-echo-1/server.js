// Railway / Node 自托管服务器：
// 1) 托管 index.html 等静态文件
// 2) 提供 /api/health 接口：转发后端现成的健康检测
//    https://xcloudm.top/api_check/api_doubtful.php
//    该接口由后端定时探测三音源，返回每个音源的 search/play 状态
//    以及后端记录的真实检测时间 last_check（字符串）。
// 服务器定时拉取并缓存，前端"最后检查时间"直接展示后端 last_check。
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PROBE_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟拉一次后端检测结果

const HEALTH_UPSTREAM = 'https://xcloudm.top/api_check/api_doubtful.php';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 内存缓存：后端健康检测结果
let cache = {
  fetchedAt: 0,          // 我们拉取后端结果的时间（仅调试用）
  raw: null,             // 后端原始 JSON
};

async function fetchUpstream() {
  const res = await fetch(HEALTH_UPSTREAM, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return null; }
}

async function refreshCache() {
  try {
    const data = await fetchUpstream();
    if (data) {
      cache.raw = data;
      cache.fetchedAt = Date.now();
      console.log('[health] upstream refreshed, last_check =',
        (data.netease && data.netease.last_check) || 'unknown');
    }
  } catch (e) {
    console.error('[health] upstream fetch error', e);
  }
}

// 把后端原始 JSON 转成前端需要的结构
function normalize(raw) {
  if (!raw) return { sources: { kuwo: null, netease: null, qq: null }, lastCheck: '' };
  const pick = (k) => {
    const s = raw[k];
    if (!s) return null;
    return {
      search: s.search === 'true' || s.search === true,
      play:   s.play   === 'true' || s.play   === true,
    };
  };
  // 三个音源共用同一个 last_check（后端一次检测三源）
  const lastCheck = raw.netease?.last_check || raw.kuwo?.last_check || raw.qq?.last_check || '';
  return {
    sources: { kuwo: pick('kuwo'), netease: pick('netease'), qq: pick('qq') },
    lastCheck,
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.toml': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }
  if (req.url.split('?')[0] === '/api/health') {
    res.writeHead(200, {
      ...CORS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(normalize(cache.raw)));
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Melody server listening on :${PORT}`);
  refreshCache();
  setInterval(refreshCache, PROBE_INTERVAL_MS);
});
