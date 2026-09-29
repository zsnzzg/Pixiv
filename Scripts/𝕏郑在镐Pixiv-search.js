/*
 * @Name              Pixiv搜索 (郑在镐·Egern版)
 * @Description       Egern 适配：类型移至标题。指令沉底。详细 Log + 镜像预览。
 * @Author            郑在镐
 * @UpdateTime        2026-09-29
 */

// ==============================
// 📋 郑在镐的填词区 (直接写，不需要引号)
// ==============================

// 🛡️ / 🔍 / ❌ 默认关键词（Cron 环境变量未填写时使用）
const DEFAULT_CORE_WORDS = `(守望先锋|斗阵特攻)`;
const DEFAULT_NORMAL_WORDS = ``;
const DEFAULT_EXCLUDE_WORDS = ``;

// ==============================
// 🚀 核心引擎
// ==============================

const DEFAULT_CONFIG = {
    notifyCount: 5,
    mode: "r18",
    order: "date_d"
};

const STORAGE_KEY = "Zzg_Pixiv_Cookie";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createLog(ctx) {
    return {
        header:  () => console.log("\n" + "=".repeat(15) + " 🟢 任务启动 " + "=".repeat(15)),
        section: (title) => console.log("\n" + "-".repeat(10) + ` ${title} ` + "-".repeat(10)),
        item:    (key, value) => console.log(`  ➤ [${key}] : ${value}`),
        footer:  () => console.log("\n" + "=".repeat(16) + " 🟢 任务结束 " + "=".repeat(16) + "\n"),
        error:   (m) => {
            console.log(`❌ [ERROR] ${m}`);
            ctx.notify({
                title: "郑在镐报错",
                body: m
            });
        }
    };
}

export default async function(ctx) {
    const Log = createLog(ctx);
    Log.header();

    const userCookie = ctx.storage.get(STORAGE_KEY);
    if (!userCookie) {
        Log.error("Cookie缺失，请先运行抓取脚本！");
        return;
    }

    // Cron 环境变量：脚本级可直接在 Egern「添加环境变量」中设置。
    // 支持：CORE_WORDS / NORMAL_WORDS / EXCLUDE_WORDS / NOTIFY_COUNT / MODE / ORDER
    const env = ctx.env || {};
    const envText = (key, fallback) => {
        const value = env[key];
        return value === undefined || value === null || String(value).trim() === ""
            ? fallback
            : String(value);
    };

    const format = (raw) => String(raw || "").replace(/\n/g, " ").trim();
    const core = format(envText("CORE_WORDS", DEFAULT_CORE_WORDS));
    const normal = format(envText("NORMAL_WORDS", DEFAULT_NORMAL_WORDS));
    const exclude = format(envText("EXCLUDE_WORDS", DEFAULT_EXCLUDE_WORDS));

    const parsedCount = parseInt(envText("NOTIFY_COUNT", DEFAULT_CONFIG.notifyCount), 10);
    const CONFIG = {
        notifyCount: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : DEFAULT_CONFIG.notifyCount,
        mode: envText("MODE", DEFAULT_CONFIG.mode),
        order: envText("ORDER", DEFAULT_CONFIG.order)
    };

    Log.item("核心关键词", core || "(空)");
    Log.item("普通关键词", normal || "(空)");
    Log.item("排除关键词", exclude || "(空)");
    Log.item("通知数量", CONFIG.notifyCount);
    Log.item("搜索模式", CONFIG.mode);
    Log.item("排序方式", CONFIG.order);

    const toApi = (str) => str.replace(/\|/g, " OR ");

    // R18G 专用三级降级：
    // Lv.1: 核心词 + 普通关键词 + R-18G，mode=r18
    // Lv.2: 核心词 + 普通关键词，mode=r18
    // Lv.3: 核心词 + 普通关键词，mode=all（最终降级）
    const isR18G = String(CONFIG.mode).toLowerCase() === "r18g";

    const normalQuery = [
        toApi(core),
        toApi(normal),
        exclude.length > 0 ? exclude.split(/\s+/).map(e => `-${e}`).join(" ") : ""
    ].filter(w => w.length > 0).join(" ");

    const r18gQuery = [
        toApi(core),
        toApi(normal),
        "R-18G",
        exclude.length > 0 ? exclude.split(/\s+/).map(e => `-${e}`).join(" ") : ""
    ].filter(w => w.length > 0).join(" ");

    const fallbackQuery = toApi(core);

    Log.section("策略解析");

    if (isR18G) {
        Log.item("内容模式", "r18g（三段式降级）");
        Log.item("Lv.1 R18G", r18gQuery);
        Log.item("Lv.2 R18", normalQuery);
        Log.item("Lv.3 ALL", normalQuery);

        await fetchPixivSearchR18G(
            ctx, Log, userCookie,
            r18gQuery, normalQuery, normalQuery,
            CONFIG
        );
        return;
    }

    Log.item("搜索指令", normalQuery);
    Log.item("保底指令", fallbackQuery);
    await fetchPixivSearch(ctx, Log, userCookie, normalQuery, "s_tag", 1, fallbackQuery, CONFIG);
}

async function fetchPixivSearchR18G(ctx, Log, cookie, lv1Query, lv2Query, lv3Query, CONFIG) {
    const searchOnce = async (query, mode, s_mode) => {
        const encoded = encodeURIComponent(query);
        const url = `https://www.pixiv.net/ajax/search/artworks/${encoded}?word=${encoded}&order=${CONFIG.order}&mode=${mode}&p=1&s_mode=${s_mode}&type=all&lang=zh`;

        const response = await ctx.http.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Cookie": `PHPSESSID=${cookie}`,
                "Referer": "https://www.pixiv.net/"
            },
            timeout: 10000
        });

        if (response.status !== 200) {
            Log.error(`P站服务器拒绝连接 (HTTP ${response.status})`);
            return [];
        }

        const json = await response.json();
        let list = (json.body && json.body.illustManga && json.body.illustManga.data) || [];
        return list.filter(item => item.id && !item.isAd);
    };

    try {
        let list = await searchOnce(lv1Query, "r18", "s_tag");

        if (list.length > 0) {
            Log.item("API 结果", `Lv.1 R18G 命中 ${list.length} 条`);
            shuffleArray(list);
            await processData(ctx, Log, list, "🔞 R18G 命中", lv1Query, CONFIG);
            return;
        }

        console.log("⚠️ Lv.1 R18G 未发现结果，降级到 Lv.2 R18 + 原关键词...");
        list = await searchOnce(lv2Query, "r18", "s_tag");

        if (list.length > 0) {
            Log.item("API 结果", `Lv.2 R18 命中 ${list.length} 条`);
            shuffleArray(list);
            await processData(ctx, Log, list, "🔞 R18 降级命中", lv2Query, CONFIG);
            return;
        }

        console.log("⚠️ Lv.2 R18 未发现结果，切换 Lv.3 ALL + 原关键词...");
        list = await searchOnce(lv3Query, "all", "s_tag");

        if (list.length > 0) {
            Log.item("API 结果", `Lv.3 ALL 命中 ${list.length} 条`);
            shuffleArray(list);
            await processData(ctx, Log, list, "🔍 ALL 最终降级", lv3Query, CONFIG);
            return;
        }

        Log.error("三级搜索全部失败，API 未返回有效数据");
    } catch (e) {
        Log.error("数据处理崩溃: " + e);
    }
}

async function fetchPixivSearch(ctx, Log, cookie, query, s_mode, level, fallback, CONFIG) {
    const encoded = encodeURIComponent(query);
    const url = `https://www.pixiv.net/ajax/search/artworks/${encoded}?word=${encoded}&order=${CONFIG.order}&mode=${CONFIG.mode}&p=1&s_mode=${s_mode}&type=all&lang=zh`;

    try {
        const response = await ctx.http.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Cookie": `PHPSESSID=${cookie}`,
                "Referer": "https://www.pixiv.net/"
            },
            timeout: 10000
        });

        if (response.status !== 200) {
            Log.error(`P站服务器拒绝连接 (HTTP ${response.status})`);
            return;
        }

        const json = await response.json();
        let list = (json.body && json.body.illustManga && json.body.illustManga.data) || [];
        list = list.filter(item => item.id && !item.isAd);

        if (list.length > 0) {
            Log.item("API 结果", `获取到数据 ${list.length} 条`);
            shuffleArray(list);
            await processData(ctx, Log, list, level === 2 ? "🔍 ALL 最终降级" : "🔍 精准命中", query, CONFIG);
        } else if (level === 1) {
            console.log("⚠️ Lv.1 未发现结果，切换保底搜索...");
            await fetchPixivSearch(ctx, Log, cookie, fallback, "s_tag_full", 2, "", CONFIG);
        } else {
            Log.error("搜索彻底失败，API 未返回有效数据");
        }
    } catch (e) {
        Log.error("数据处理崩溃: " + e);
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function processData(ctx, Log, list, prefix, currentQuery, CONFIG) {
    const items = list.slice(0, CONFIG.notifyCount);

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // 固定本轮通知的 PID / 点击地址，避免连续通知时引用串位
        const pid = String(item.id);
        const actionUrl = `pixiv://illusts/${pid}`;

        // --- 🖼️ 图片地址处理 ---
        // 先通过 Pixiv 官方作品详情接口取得该作品真实存在的高清图片地址。
        // 仍然只使用 Pixiv 官方 i.pximg.net，不使用任何第三方镜像。
        let mediaUrl = item.url;

        try {
            const detailResponse = await ctx.http.get(`https://www.pixiv.net/ajax/illust/${pid}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Cookie": `PHPSESSID=${ctx.storage.get(STORAGE_KEY)}`,
                    "Referer": `https://www.pixiv.net/artworks/${pid}`
                },
                timeout: 10000
            });

            if (detailResponse.status === 200) {
                const detailJson = await detailResponse.json();
                const urls = detailJson && detailJson.body && detailJson.body.urls;

                // regular 通常比搜索缩略图清晰，同时比 original 更适合通知附件体积。
                if (urls && urls.regular) {
                    mediaUrl = urls.regular;
                }
            }
        } catch (e) {
            console.log(`  ├─ 高清地址 : 获取失败，使用搜索图 (${e})`);
        }

        // --- 🏷️ 类型识别 ---
        let typeLabel = "插画";
        if (item.illustType == 1 || item.pageCount > 1) typeLabel = "漫画";
        if (item.illustType == 2) typeLabel = "动图";
        const pageInfo = item.pageCount > 1 ? ` (${item.pageCount}P)` : "";

        // --- 📊 详细地址构建 (仅用于 Log 展示) ---
        const postUrl = `https://www.pixiv.net/artworks/${pid}`;

        const tagsShort = item.tags ? item.tags.slice(0, 5).join(", ") : "无";
        const displayQuery = currentQuery.length > 30 ? currentQuery.substring(0, 30) + "..." : currentQuery;

        // --- 📝 控制台 Log (详细档案) ---
        console.log(`\n🖼️ [${prefix} ${i+1}/${items.length}] PID: ${pid}`);
        console.log(`  ├─ 标题 : ${item.title}`);
        console.log(`  ├─ 标签 : ${item.tags ? item.tags.join(", ") : ""}`);
        console.log(`  └─ 原文 : ${postUrl}`);

        // --- 📲 Egern 推送通知 ---
        // 由脚本直接请求 Pixiv 官方图片，带 Referer 通过防盗链检查，
        // 成功后转为 Base64 交给通知；通知系统不再直接访问图片 URL。
        let attachment;

        try {
            const imageResponse = await ctx.http.get(mediaUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://www.pixiv.net/"
                },
                timeout: 15000
            });

            if (imageResponse.status === 200) {
                const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
                const imageBuffer = await imageResponse.arrayBuffer();

                if (imageBuffer.byteLength > 0) {
                    attachment = {
                        base64: arrayBufferToBase64(imageBuffer),
                        mimeType: contentType.split(";")[0].trim()
                    };
                    console.log(`  ├─ 高清地址 : ${mediaUrl}`);
                    console.log(`  └─ 官方通知图 : Base64 成功 (${imageBuffer.byteLength} bytes, ${attachment.mimeType})`);
                } else {
                    console.log("  └─ 官方通知图 : 响应为空，本条仅发送文字通知");
                }
            } else {
                console.log(`  └─ 官方通知图 : HTTP ${imageResponse.status}，本条仅发送文字通知`);
            }
        } catch (e) {
            console.log(`  └─ 官方通知图 : 下载失败 (${e})，本条仅发送文字通知`);
        }

        const notification = {
            title: `郑在镐 Pixiv (${i+1}/${items.length})\n${prefix} [${typeLabel}]`,
            subtitle: `🎨作品: ${item.title}`,
            body: `👤画师: ${item.userName}${pageInfo}\n🏷️标签: ${tagsShort}\n🔍指令: ${displayQuery}`,
            action: {
                type: "openUrl",
                url: actionUrl
            }
        };

        if (attachment) notification.attachment = attachment;
        ctx.notify(notification);

        // 与前一个 R-18G 脚本保持一致：连续通知间隔 1 秒
        if (i < items.length - 1) {
            await sleep(2500);
        }
    }

    Log.footer();
}
