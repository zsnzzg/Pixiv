/*
* @Name              𝕏郑在镐 Pixiv搜索
* @Description       类型移至标题。指令沉底。详细 Log (含 #manga) + 镜像预览。
* @Author            𝕏郑在镐
* @UpdateTime        2026-02-10
*/

// ==============================
// 📋 郑在镐的填词区 (直接写，不需要引号)
// ==============================

// 🛡️ 核心关键词
const DEFAULT_CORE_WORDS = `
(守望先锋|斗阵特攻)
`.trim();

// 🔍 普通关键词
const DEFAULT_NORMAL_WORDS = `

`.trim();

// ❌ 排除关键词
const DEFAULT_EXCLUDE_WORDS = `

`.trim();

// ==============================
// 🚀 核心引擎
// ==============================

// Loon Plugin [Argument] 参数由插件通过 $argument 注入。
// 直接运行脚本时也保留默认值，方便调试。
const ARG = (typeof $argument === "object" && $argument) || {};
const CONFIG = {
    notifyCount: Math.max(1, parseInt(ARG.NOTIFY_COUNT || 5, 10) || 5),
    mode: String(ARG.MODE || "r18").toLowerCase(),
    order: String(ARG.ORDER || "date_d"),
    notifyInterval: 2500
};

const CORE_WORDS = String(ARG.CORE_WORDS || DEFAULT_CORE_WORDS).trim();
const NORMAL_WORDS = String(ARG.NORMAL_WORDS || DEFAULT_NORMAL_WORDS).trim();
const EXCLUDE_WORDS = String(ARG.EXCLUDE_WORDS || DEFAULT_EXCLUDE_WORDS).trim();

const Storage = { key: "Zzg_Pixiv_Cookie", get: () => $persistentStore.read(Storage.key) };

const Log = {
    header:  () => console.log("\n" + "=".repeat(15) + " 🟢 任务启动 " + "=".repeat(15)),
    section: (title) => console.log("\n" + "-".repeat(10) + ` ${title} ` + "-".repeat(10)),
    item:    (key, value) => console.log(`  ➤ [${key}] : ${value}`),
    footer:  () => console.log("\n" + "=".repeat(16) + " 🟢 任务结束 " + "=".repeat(16) + "\n"),
    error:   (m) => { 
        console.log(`❌ [ERROR] ${m}`); 
        $notification.post("郑在镐报错", "", m); 
        $done({}); 
    }
};

function start() {
    Log.header();
    const userCookie = Storage.get();
    if (!userCookie) { Log.error("Cookie缺失，请先运行抓取脚本！"); return; }

    const format = (raw) => raw.replace(/\n/g, " ").trim();
    const core = format(CORE_WORDS);
    const normal = format(NORMAL_WORDS);
    const exclude = format(EXCLUDE_WORDS);

    const toApi = (str) => str.replace(/\|/g, " OR ");

    let q1 = [toApi(core), toApi(normal), exclude.length > 0 ? exclude.split(/\s+/).map(e => `-${e}`).join(" ") : ""].filter(w => w.length > 0).join(" ");
    let q2 = toApi(core);

    Log.section("策略解析");
    Log.item("搜索指令", q1);

    const modes = CONFIG.mode === "r18g"
        ? ["r18g", "r18", "all"]
        : [CONFIG.mode];
    fetchPixivSearch(userCookie, q1, "s_tag", 1, q2, modes, 0);
}

function fetchPixivSearch(cookie, query, s_mode, level, fallback, modes, modeIndex) {
    const encoded = encodeURIComponent(query);
    const mode = modes[modeIndex] || CONFIG.mode;
    const url = `https://www.pixiv.net/ajax/search/artworks/${encoded}?word=${encoded}&order=${CONFIG.order}&mode=${mode}&p=1&s_mode=${s_mode}&type=all&lang=zh`;
    
    $httpClient.get({
        url: url,
        headers: { "User-Agent": "Mozilla/5.0", "Cookie": `PHPSESSID=${cookie}`, "Referer": "https://www.pixiv.net/" },
        timeout: 10000
    }, (error, response, data) => {
        if (error || response.status !== 200) { Log.error("P站服务器拒绝连接"); return; }

        try {
            const json = JSON.parse(data);
            let list = (json.body && json.body.illustManga && json.body.illustManga.data) || [];
            list = list.filter(item => item.id && !item.isAd);

            if (list.length > 0) {
                Log.item("API 结果", `获取到数据 ${list.length} 条`);
                shuffleArray(list);
                processData(list, level === 2 ? "🛡️ 核心保底" : `🔍 ${mode.toUpperCase()} 命中`, query);
            } else if (level === 1) {
                console.log("⚠️ Lv.1 未发现结果，切换保底搜索...");
                fetchPixivSearch(cookie, fallback, "s_tag_full", 2, "", modes, modeIndex);
            } else if (modeIndex + 1 < modes.length) {
                console.log(`⚠️ ${mode} 未发现结果，降级到 ${modes[modeIndex + 1]}...`);
                fetchPixivSearch(cookie, query, s_mode, level, fallback, modes, modeIndex + 1);
            } else {
                Log.error("搜索彻底失败，API 未返回有效数据");
            }
        } catch (e) { Log.error("数据处理崩溃: " + e); }
    });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Uint8Array -> Base64（不依赖 btoa，兼容 Loon 二进制响应）
function bytesToBase64(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";

    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const triple = (a << 16) | (b << 8) | c;

        result += chars[(triple >> 18) & 63];
        result += chars[(triple >> 12) & 63];
        result += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : "=";
        result += i + 2 < bytes.length ? chars[triple & 63] : "=";
    }

    return result;
}

function getMimeType(response, url) {
    const headers = (response && response.headers) || {};
    const contentType = headers["Content-Type"] || headers["content-type"] || "";

    if (/image\/(?:png|jpeg|gif|webp)/i.test(contentType)) {
        return contentType.split(";")[0].trim().toLowerCase();
    }
    if (/\.png(?:$|\?)/i.test(url)) return "image/png";
    if (/\.gif(?:$|\?)/i.test(url)) return "image/gif";
    if (/\.webp(?:$|\?)/i.test(url)) return "image/webp";
    return "image/jpeg";
}

function normalizePixivImageUrl(url) {
    // 不再使用任何镜像站，统一回到 Pixiv 官方图片域名
    let officialUrl = String(url || "").replace(/^https?:\/\/[^/]*pixiv\.re\//i, "https://i.pximg.net/");
    officialUrl = officialUrl.replace(/^http:\/\/i\.pximg\.net\//i, "https://i.pximg.net/");
    officialUrl = officialUrl.replace(/\/c\/[a-zA-Z0-9_]+\/img-master\//, "/img-master/");
    officialUrl = officialUrl
        .replace("_square1200", "_master1200")
        .replace("_custom1200", "_master1200");
    return officialUrl;
}

function fetchImageBase64(url, callback) {
    $httpClient.get({
        url: url,
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.pixiv.net/"
        },
        timeout: 15000,
        "binary-mode": true
    }, (error, response, data) => {
        if (error || !response || response.status !== 200 || !data) {
            callback(null, `图片获取失败: ${error || (response && response.status) || "unknown"}`);
            return;
        }

        try {
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            const mime = getMimeType(response, url);
            callback(`data:${mime};base64,${bytesToBase64(bytes)}`, null);
        } catch (e) {
            callback(null, "Base64 转换失败: " + e);
        }
    });
}

function processData(list, prefix, currentQuery) {
    const items = list.slice(0, CONFIG.notifyCount);
    let index = 0;

    function sendNext() {
        if (index >= items.length) {
            Log.footer();
            $done({});
            return;
        }

        const i = index++;
        const item = items[i];

        // --- 🖼️ Pixiv 官方图片地址 ---
        const mediaUrl = normalizePixivImageUrl(item.url);

        // --- 🏷️ 类型识别 ---
        let typeLabel = "插画";
        if (item.illustType == 1 || item.pageCount > 1) typeLabel = "漫画";
        if (item.illustType == 2) typeLabel = "动图";
        const pageInfo = item.pageCount > 1 ? ` (${item.pageCount}P)` : "";

        // --- 📊 详细地址构建 (仅用于 Log 展示) ---
        const postUrl = `https://www.pixiv.net/artworks/${item.id}${typeLabel === "漫画" ? "#manga" : ""}`;

        const tagsShort = item.tags ? item.tags.slice(0, 5).join(", ") : "无";
        const displayQuery = currentQuery.length > 30 ? currentQuery.substring(0, 30) + "..." : currentQuery;

        console.log(`\n🖼️ [${prefix} ${i + 1}/${items.length}] PID: ${item.id}`);
        console.log(`  ├─ 标题 : ${item.title}`);
        console.log(`  ├─ 标签 : ${item.tags ? item.tags.join(", ") : ""}`);
        console.log(`  ├─ 原图 : ${mediaUrl}`);
        console.log(`  └─ 原文 : ${postUrl}`);

        // 先由脚本携带 Pixiv Referer 获取官方图片，再以内嵌 Base64 交给 Loon 通知。
        fetchImageBase64(mediaUrl, (base64Image, imageError) => {
            if (imageError) console.log(`  ⚠️ ${imageError}`);

            const attach = {
                openUrl: `pixiv://illusts/${item.id}`
            };
            if (base64Image) attach.mediaUrl = base64Image;

            $notification.post(
                `𝕏郑在镐 Pixiv [${i + 1}/${items.length}]`,
                `${prefix} [${typeLabel}]`,
                `🎨作品: ${item.title}\n👤画师: ${item.userName}${pageInfo}\n🏷️标签: ${tagsShort}\n🔍指令: ${displayQuery}`,
                attach
            );

            // 每条通知之间间隔 2.5 秒；最后一条发完后直接结束。
            if (index < items.length) {
                setTimeout(sendNext, CONFIG.notifyInterval);
            } else {
                Log.footer();
                $done({});
            }
        });
    }

    sendNext();
}

start();
