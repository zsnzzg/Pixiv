/*
* @Name              Pixiv Cookie 自动抓取
* @Description       访问 Pixiv 时自动提取 PHPSESSID 并持久化存储，供涩图脚本使用。
* @Author            𝕏郑在镐
* @UpdateTime        2026-02-18
* @Match             ^https:\/\/www\.pixiv\.net\/
*/

// ⚠️ 必须与看图脚本里的 Key 保持一致
const STORE_KEY = "Zzg_Pixiv_Cookie";

const headers = $request.headers;
// 兼容不同写法 (Cookie / cookie)
const cookieStr = headers['Cookie'] || headers['cookie'];

if (cookieStr) {
    // 正则提取 PHPSESSID
    // 格式通常是: ...; PHPSESSID=123456_xxxxxx; ...
    const regex = /PHPSESSID=([^;]+)/;
    const match = cookieStr.match(regex);

    if (match && match[1]) {
        const newSessionID = match[1];
        const oldSessionID = $persistentStore.read(STORE_KEY);

        // 只有当 Cookie 发生变化时才写入和通知 (避免刷屏)
        if (newSessionID !== oldSessionID) {
            const success = $persistentStore.write(newSessionID, STORE_KEY);
            
            if (success) {
                console。log(`[Pixiv] Cookie 更新成功: ${newSessionID.substring(0, 10)}...`);
                $notification.post(
                    "Pixiv Cookie 抓取成功 🎉", 
                    "您的 PHPSESSID 已更新", 
                    "现在去运行涩图脚本，就是 VIP 推荐模式了！"
                );
            } else {
                console.log("[Pixiv] Cookie 写入失败");
            }
        } else {
            console.log("[Pixiv] Cookie 未变更，跳过更新");
        }
    } else {
        console.log("[Pixiv] 未在请求头中找到 PHPSESSID");
    }
}

$done({});
