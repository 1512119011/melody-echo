// Railway / Node 自托管服务器：
// 1) 托管 index.html 等静态文件
// 2) 提供 /api/health 接口：服务器端真实探测网易/酷我/QQ 三音源，
//    并把服务器端"本次检测开始的时间"作为 serverTime 返回。
// 前端"最后检查时间"取该 serverTime，而非浏览器本地时间。
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const GDS_API = 'https://music-api.gdstudio.xyz/api.php';
const XCLOUD_API = 'https://xcloudm.top/php';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      accept: 'application/json, text/plain, */*',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return null; }
}

async function probeKuwo() {
  let list = [];
  try {
    const d = await fetchJson(
      GDS_API + '?types=search&source=kuwo&name=' + encodeURIComponent('周杰伦') + '&pages=1&count=1'
    );
    list = Array.isArray(d) ? d : (d && d.data) || [];
  } catch (e) { list = []; }
  if (!list.length) {
    try {
      const body = new URLSearchParams({ action: 'search', all: '周杰伦', pn: '1' });
      const d = await fetchJson(XCLOUD_API + '/kuwo_backup_source.php', { method: 'POST', body });
      list = (d && d.raw && d.raw.list) || (d && d.list) || [];
    } catch (e) { list = []; }
  }
  const search = Array.isArray(list) && list.length > 0;
  let play = false;
  if (search) {
    const s = list[0] || {};
    const id = s.id || s.MUSICRID || '';
    try {
      const body = new URLSearchParams({ action: 'url', songid: String(id), br: '128' });
      const d = await fetchJson(XCLOUD_API + '/kuwo_backup_source.php', { method: 'POST', body });
      play = !!(d && d.url);
    } catch (e) {}
  }
  return { search, play };
}

async function probeNetease() {
  let list = [];
  try {
    const d = await fetchJson(
      GDS_API + '?types=search&source=netease&name=' + encodeURIComponent('周杰伦') + '&pages=1&count=1'
    );
    list = Array.isArray(d) ? d : (d && d.data) || [];
  } catch (e) { list = []; }
  const search = Array.isArray(list) && list.length > 0;
  let play = false;
  if (search) {
    const s = list[0] || {};
    const id = s.id || s.url_id || '';
    try {
      const d = await fetchJson(
        GDS_API + '?types=url&source=netease&id=' + encodeURIComponent(id) + '&br=192'
      );
      play = !!(d && d.url);
    } catch (e) {}
  }
  return { search, play };
}

async function probeQQ() {
  let list = [];
  try {
    const d = await fetchJson(
      XCLOUD_API + '/qq_source.php?action=search&all=' + encodeURIComponent('周杰伦') + '&pn=1'
    );
    list = Array.isArray(d) ? d : (d && d.data) || [];
  } catch (e) { list = []; }
  const search = Array.isArray(list) && list.length > 0;
  let play = false;
  if (search) {
    const s = list[0] || {};
    const id = s.id || s.url_id || '';
    try {
      const d = await fetchJson(
        XCLOUD_API + '/qq_source.php?action=url&songid=' + encodeURIComponent(id) + '&br=192'
      );
      play = !!(d && d.success && d.url);
    } catch (e) {}
  }
  return { search, play };
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
  // 防止路径穿越
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
    const serverTime = Date.now(); // 服务器端检测开始时刻
    try {
      const [kuwo, netease, qq] = await Promise.all([probeKuwo(), probeNetease(), probeQQ()]);
      res.writeHead(200, { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ serverTime, sources: { kuwo, netease, qq } }));
    } catch (e) {
      res.writeHead(500, { ...CORS, 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => console.log(`Melody server listening on :${PORT}`));
