// Netlify Edge Function: 音源可用性健康检查
// 路径: /api/health
// 由服务器端并行探测 网易/酷我/QQ 三个音源的搜索+播放能力，
// 并把服务器端"本次检测开始的时间"作为 serverTime 返回。
// 前端展示的"最后检查时间"取该 serverTime，而非浏览器本地时间。
export const config = { path: "/api/health" };

const GDS_API = "https://music-api.gdstudio.xyz/api.php";
const XCLOUD_API = "https://xcloudm.top/php";

async function probeKuwo() {
  let list = [];
  // 主通道：GDS 酷我搜索
  try {
    const r = await fetch(
      GDS_API + "?types=search&source=kuwo&name=" + encodeURIComponent("周杰伦") + "&pages=1&count=1"
    );
    const d = await r.json();
    list = Array.isArray(d) ? d : d.data || [];
  } catch (e) {
    list = [];
  }
  // 备用通道：XCloud 酷我
  if (!list.length) {
    try {
      const fd = new FormData();
      fd.append("action", "search");
      fd.append("all", "周杰伦");
      fd.append("pn", "1");
      const r = await fetch(XCLOUD_API + "/kuwo_backup_source.php", { method: "POST", body: fd });
      const d = await r.json();
      list = (d && d.raw && d.raw.list) || (d && d.list) || [];
    } catch (e) {
      list = [];
    }
  }
  const search = Array.isArray(list) && list.length > 0;
  let play = false;
  if (search) {
    const s = list[0] || {};
    const id = s.id || s.MUSICRID || "";
    try {
      const fd = new FormData();
      fd.append("action", "url");
      fd.append("songid", String(id));
      fd.append("br", "128");
      const r = await fetch(XCLOUD_API + "/kuwo_backup_source.php", { method: "POST", body: fd });
      const d = await r.json();
      play = !!(d && d.url);
    } catch (e) {}
  }
  return { search, play };
}

async function probeNetease() {
  let list = [];
  try {
    const r = await fetch(
      GDS_API + "?types=search&source=netease&name=" + encodeURIComponent("周杰伦") + "&pages=1&count=1"
    );
    const d = await r.json();
    list = Array.isArray(d) ? d : d.data || [];
  } catch (e) {
    list = [];
  }
  const search = Array.isArray(list) && list.length > 0;
  let play = false;
  if (search) {
    const s = list[0] || {};
    const id = s.id || s.url_id || "";
    try {
      const r = await fetch(
        GDS_API + "?types=url&source=netease&id=" + encodeURIComponent(id) + "&br=192"
      );
      const d = await r.json();
      play = !!(d && d.url);
    } catch (e) {}
  }
  return { search, play };
}

async function probeQQ() {
  let list = [];
  try {
    const r = await fetch(
      XCLOUD_API + "/qq_source.php?action=search&all=" + encodeURIComponent("周杰伦") + "&pn=1"
    );
    const d = await r.json();
    list = Array.isArray(d) ? d : d.data || [];
  } catch (e) {
    list = [];
  }
  const search = Array.isArray(list) && list.length > 0;
  let play = false;
  if (search) {
    const s = list[0] || {};
    const id = s.id || s.url_id || "";
    try {
      const r = await fetch(
        XCLOUD_API + "/qq_source.php?action=url&songid=" + encodeURIComponent(id) + "&br=192"
      );
      const d = await r.json();
      play = !!(d && d.success && d.url);
    } catch (e) {}
  }
  return { search, play };
}

export default async (request) => {
  // 服务器端检测开始的时间戳——这才是"API 实际检测时间"
  const serverTime = Date.now();
  const [kuwo, netease, qq] = await Promise.all([probeKuwo(), probeNetease(), probeQQ()]);
  const body = {
    serverTime,
    sources: { kuwo, netease, qq },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
};
