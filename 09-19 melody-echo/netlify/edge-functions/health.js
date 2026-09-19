// Netlify Edge Function: 音源可用性健康检查
// 路径: /api/health
// 转发后端现成的健康检测接口 xcloudm.top/api_check/api_doubtful.php，
// 把后端记录的 last_check 时间和三音源状态透传给前端。
export const config = { path: "/api/health" };

const UPSTREAM = "https://xcloudm.top/api_check/api_doubtful.php";

function normalize(raw) {
  if (!raw) return { sources: { kuwo: null, netease: null, qq: null }, lastCheck: "" };
  const pick = (k) => {
    const s = raw[k];
    if (!s) return null;
    return {
      search: s.search === "true" || s.search === true,
      play: s.play === "true" || s.play === true,
    };
  };
  const lastCheck = raw.netease?.last_check || raw.kuwo?.last_check || raw.qq?.last_check || "";
  return {
    sources: { kuwo: pick("kuwo"), netease: pick("netease"), qq: pick("qq") },
    lastCheck,
  };
}

export default async (request) => {
  try {
    const r = await fetch(UPSTREAM, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "application/json",
      },
    });
    const raw = await r.json();
    return new Response(JSON.stringify(normalize(raw)), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    });
  }
};
