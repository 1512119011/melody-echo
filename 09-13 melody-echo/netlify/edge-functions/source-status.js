// Netlify Edge Function: 音源状态 API 代理
// 路径: /api/source-status
// 作用：转发请求到第三方音源状态检测接口，并附加 CORS 头，
//       解决浏览器直连被跨域拦截、第三方 CORS 代理普遍失效的问题。
// 同时在边缘节点做缓存（30秒），降低上游压力、加快响应。

export const config = { path: "/api/source-status" };

const UPSTREAM = "https://music.xcloudv.top/api_check/api_doubtful.php";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default async (request) => {
  // 预检请求直接返回
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  try {
    // 带超时的上游请求（8秒），避免 Edge Function 被慢响应拖死
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(UPSTREAM, {
      signal: controller.signal,
      headers: { "User-Agent": "MelodyMusicBox-EdgeProxy/1.0" },
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      throw new Error(`上游返回 HTTP ${upstream.status}`);
    }

    const text = await upstream.text();
    // 校验是否为合法 JSON（简单校验）
    JSON.parse(text);

    return new Response(text, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "content-type": "application/json; charset=utf-8",
        // 边缘缓存 30 秒，音源状态不需要实时
        "cache-control": "public, max-age=30, s-maxage=30",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "音源状态接口暂不可用",
        detail: String(err.message || err),
      }),
      {
        status: 502,
        headers: {
          ...CORS_HEADERS,
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  }
};
