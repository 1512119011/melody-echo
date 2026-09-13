# Melody 音乐盒 - 分享链接音源固化修复

## 问题
分享链接丢失原始曲库与歌曲唯一 ID 信息。网易云曲库生成的分享链接打开后，未使用链接内指定的网易云歌曲资源，自动跳转酷我按歌名搜索歌曲，导致音源匹配错误，出现播放失败。

## 原因
- 分享链接只传了 `name`（歌名）、`artist`（歌手）、`pic`（封面），**没有传递来源曲库（source）和歌曲唯一 ID（id）**
- Edge Function 跳转目标是 `/#/search?keyword=歌名 歌手`，按歌名模糊搜索
- 搜索页默认曲库为酷我（`searchSource: 'kuwo'`），导致网易云的歌被迫用酷我搜索 → 匹配错误 → 播放失败

## 解决方案
分享链接**固化「来源曲库 + 歌曲 ID」**，打开时优先按链接存储的 ID 在对应曲库加载歌曲，禁止直接跨库模糊搜索；原始音源失效再做降级切换音源。

### 工作流程
1. 用户点分享 → 生成链接 `https://你的域名/share?name=歌名&artist=歌手&pic=封面URL&source=曲库&id=歌曲ID`
2. 微信/QQ 爬虫抓取该链接 → Edge Function 返回包含 `og:title` / `og:image` / `og:description` 的 HTML
3. 微信/QQ 显示带专辑封面、歌名、歌手的预览卡片
4. 用户点击卡片 → 跳转 `/#/play?source=曲库&id=歌曲ID&name=...&artist=...&pic=...&autoplay=1`
5. 页面按 `source + id` 在对应曲库精确加载并播放歌曲
6. 若原始音源播放失败（audio error 或 12 秒内未成功播放），自动按顺序在其他曲库搜索同一首歌并切换

### 兼容性
- 新版分享链接（带 `source` + `id`）→ 走 `/#/play` 按 ID 精确播放
- 旧版分享链接（无 `source`/`id`）→ Edge Function 自动回退到 `/#/search` 搜索播放，不影响已有链接

## 文件说明
```
melody-share-fix/
├── index.html                          # 主页面（分享链接生成增加 source/id；新增 /play 路由和降级逻辑）
├── netlify.toml                        # Netlify 部署配置（Edge Function 路由映射）
└── netlify/
    └── edge-functions/
        └── share.js                    # Edge Function（接收 source/id，跳转 /play 路由）
```

## 部署步骤
### 方式一：Git 部署（推荐）
1. 将这 3 个文件（保持目录结构）推送到你的 GitHub 仓库
2. 在 Netlify 控制台重新触发部署（Deploys → Trigger deploy）
3. 部署完成后，Edge Functions 会自动生效

### 方式二：拖拽部署
1. 将 `index.html`、`netlify.toml` 和 `netlify/` 文件夹一起打包
2. 登录 Netlify → 你的站点 → Deploys → 拖拽整个文件夹到部署区域
3. 等待部署完成

### 验证部署成功
部署完成后，在浏览器访问（替换为你的域名和真实歌曲参数）：
```
https://你的域名/share?name=Always Online&artist=林俊杰&pic=https://p1.music.126.net/xxx.jpg&source=netease&id=123456
```
应该能看到带封面的歌曲卡片页面，点击"播放歌曲"后跳转到播放页，顶部音源标签应显示"网易云音乐"（而非酷我），并能正常播放。

## 注意事项
1. **微信缓存**：微信对链接预览有缓存，第一次测试如果没显示卡片，等几分钟再试，或换一个未分享过的歌曲链接测试
2. **封面图片**：`pic` 参数来自歌曲数据中的 `pic` 字段。如果某些歌曲封面图有防盗链导致微信抓不到，卡片会显示默认图标
3. **已有 netlify.toml**：如果你的项目已有 `netlify.toml`，把其中 `[[edge_functions]]` 和 `[build]` 部分合并进去即可，不要覆盖原有配置
4. **Edge Functions 配额**：Netlify 免费版每月有 100 万次 Edge Function 调用，个人使用完全足够
5. **降级逻辑**：原始音源失效后会自动尝试酷我 → 网易云 → QQ → 酷狗（排除原始曲库），找到可用音源即切换；全部失败则提示"所有音源均无法播放该歌曲"

---

## 2026-09-13 音源状态检测修复

### 问题
右上角「音源状态」面板四个音源（酷我/QQ/酷狗/网易云）全部卡在「检测中...」，永远不返回结果。

### 原因
- 音源状态接口 `https://music.xcloudv.top/api_check/api_doubtful.php` 本身不带 CORS 头，浏览器直连会被跨域拦截
- 代码依赖 3 个第三方 CORS 代理（cors.sh / allorigins / codetabs）做中转，但这 3 个服务当前全部不可用
- 所有检测通道同时失效 → 请求永远 pending → UI 停留在「检测中」
- 附带 bug：`markSourceStatusFailed()` 失败时圆点错误地保持 `checking`（黄色脉冲），视觉上和「检测中」无法区分

### 解决方案
1. **新增自建 Edge Function 代理** `netlify/edge-functions/source-status.js`，路径 `/api/source-status`
   - 服务端转发请求到上游状态接口，附加 `Access-Control-Allow-Origin: *` 头
   - 同域请求，无跨域问题，不依赖任何第三方代理
   - 边缘缓存 30 秒，降低上游压力
   - 8 秒超时保护，失败返回 502 + 错误信息
2. **修改检测通道优先级**：自建代理设为首选（6秒超时），直连和第三方代理作为兜底
3. **修复失败状态样式**：检测失败时圆点变为红色（`offline`），文字显示「检测失败，点刷新重试」，紧凑按钮同步更新

### 新增文件
```
netlify/edge-functions/source-status.js   # 音源状态 API 代理
```

### 修改文件
- `index.html` — 检测通道增加自建代理并设为首选；修复失败状态样式
- `netlify.toml` — 增加 `/api/source-status` 路由映射

### 验证
部署后打开页面，右上角音源状态应在 1-2 秒内显示各音源的「搜索✓/播放✓」状态，不再卡在「检测中」。
