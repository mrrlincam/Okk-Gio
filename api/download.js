const axios = require("axios");
const { pipeline } = require("node:stream/promises");

const USER_AGENT = "Mozilla/5.0";
const TIKTOK_HOST = "tiktok.com";
const MEDIA_HOSTS = [
    "tiktok.com",
    "tiktokcdn.com",
    "tiktokv.com",
    "byteoversea.com",
    "ibytedtos.com",
    "tikwm.com",
    "tiklydown.eu"
];

function matchesHost(hostname, domains) {
    const normalizedHost = (hostname || "").toLowerCase().replace(/\.$/, "");
    return domains.some(domain =>
        normalizedHost === domain || normalizedHost.endsWith("." + domain)
    );
}

function isTikTokHost(hostname) {
    return matchesHost(hostname, [TIKTOK_HOST]);
}

function normalizeTikTokUrl(input) {
    if (typeof input !== "string") return "";
    const match = input.match(
        /https?:\/\/(?:www\.|m\.|vm\.|vt\.)?tiktok\.com\/[^\s"'<>]+/i
    );
    if (!match) return "";

    try {
        const parsed = new URL(match[0].replace(/[),.;!?]+$/, ""));
        if (!isTikTokHost(parsed.hostname) || !["http:", "https:"].includes(parsed.protocol)) {
            return "";
        }
        parsed.protocol = "https:";
        if (parsed.hostname.toLowerCase() === "m.tiktok.com") {
            parsed.hostname = "www.tiktok.com";
        }
        if (isShortTikTokUrl(parsed)) return parsed.toString();
        parsed.search = "";
        parsed.hash = "";
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return "";
    }
}

function isShortTikTokUrl(parsed) {
    const hostname = parsed.hostname.toLowerCase();
    return /^(vm|vt)\.tiktok\.com$/.test(hostname) || parsed.pathname.startsWith("/t/");
}

function isAllowedMediaUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && matchesHost(parsed.hostname, MEDIA_HOSTS);
    } catch {
        return false;
    }
}

async function resolveRedirectUrl(url) {
    let currentUrl = url;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const response = await axios.get(currentUrl, {
                maxRedirects: 0,
                maxContentLength: 1024 * 1024,
                timeout: 10000,
                headers: { "User-Agent": USER_AGENT },
                validateStatus: status => status >= 200 && status < 400
            });
            const location = response.headers?.location;
            if (response.status < 300 || response.status >= 400 || !location) {
                return normalizeTikTokUrl(currentUrl) || currentUrl;
            }

            const nextUrl = new URL(location, currentUrl);
            if (nextUrl.protocol !== "https:" || !isTikTokHost(nextUrl.hostname)) {
                return currentUrl;
            }
            currentUrl = nextUrl.toString();
        } catch {
            return currentUrl;
        }
    }

    return normalizeTikTokUrl(currentUrl) || currentUrl;
}

async function fetchFromTikWM(url, quality) {
    const response = await axios.post(
        "https://www.tikwm.com/api/",
        { url, hd: quality === "standard" ? 0 : 1 },
        {
            timeout: 20000,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT
            }
        }
    );

    const payload = response.data;
    const data = payload?.data;
    if (payload?.code !== 0 || !data) return null;

    const playUrl = quality === "standard"
        ? data.play || data.hdplay || ""
        : data.hdplay || data.play || "";
    if (!isAllowedMediaUrl(playUrl)) return null;

    return {
        provider: "tikwm",
        title: data.title || "TikTok Video",
        cover: data.cover || "",
        play: playUrl,
        isHd: Boolean(data.hdplay),
        music: isAllowedMediaUrl(data.music) ? data.music : "",
        author: data.author?.nickname || data.author?.unique_id || "TikTok"
    };
}

async function fetchFromTiklyDown(url, quality) {
    const response = await axios.get("https://api.tiklydown.eu/api/download", {
        params: { url },
        timeout: 15000,
        headers: { "User-Agent": USER_AGENT }
    });

    const data = response.data?.data;
    if (!data) return null;

    const videoCandidates = quality === "standard"
        ? [data.play, data.video?.noWatermark, data.videoUrl, data.hd_play]
        : [data.videoUrl, data.hd_play, data.play, data.video?.noWatermark];
    const playUrl = videoCandidates.find(isAllowedMediaUrl);
    if (!playUrl) return null;

    const musicUrl = [data.music, data.musicUrl].find(isAllowedMediaUrl) || "";
    return {
        provider: "tiklydown",
        title: data.title || "TikTok Video",
        cover: data.cover || data.video?.cover || "",
        play: playUrl,
        isHd: Boolean(data.videoUrl || data.hd_play),
        music: musicUrl,
        author: data.author?.name || data.author?.unique_id || "TikTok"
    };
}

async function fetchFromProviders(url, quality) {
    for (const provider of [fetchFromTikWM, fetchFromTiklyDown]) {
        try {
            const result = await provider(url, quality);
            if (result?.play) return result;
        } catch (error) {
            const reason = error?.response?.status || error?.code || "request failed";
            console.warn(`[${provider.name}] failed: ${reason}`);
        }
    }
    return null;
}

module.exports = async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const isFileDownload = req.method === "GET";

    try {
        const input = isFileDownload ? req.query || {} : req.body || {};
        const url = typeof input.url === "string" ? input.url : "";
        const quality = typeof input.quality === "string" ? input.quality : "2k";
        const format = typeof input.format === "string" ? input.format : "mp4";

        if (!['2k', 'standard'].includes(quality)) {
            return res.status(400).json({
                success: false,
                error: "Invalid quality option"
            });
        }

        if (!['mp4', 'mp3'].includes(format)) {
            return res.status(400).json({
                success: false,
                error: "Invalid download format"
            });
        }

        if (!url) {
            return res.status(400).json({
                error: "Please enter TikTok URL"
            });
        }

        const normalizedUrl = normalizeTikTokUrl(url);
        if (!normalizedUrl) {
            return res.status(400).json({
                success: false,
                error: "Invalid TikTok URL"
            });
        }

        const parsedUrl = new URL(normalizedUrl);
        const cleanUrl = isShortTikTokUrl(parsedUrl)
            ? await resolveRedirectUrl(normalizedUrl)
            : normalizedUrl;
        const result = await fetchFromProviders(cleanUrl, quality);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: "Video not found, private, or the TikTok API is temporarily unavailable."
            });
        }

        const mediaUrl = isFileDownload && format === "mp3" ? result.music : result.play;

        if (!mediaUrl) {
            return res.status(422).json({
                success: false,
                error: format === "mp3"
                    ? "This video has no downloadable music source."
                    : "This video has no higher-quality source stream. Choose standard quality instead."
            });
        }

        if (isFileDownload) {
            if (!isAllowedMediaUrl(mediaUrl)) {
                return res.status(422).json({
                    success: false,
                    error: "The provider returned an unsupported media source."
                });
            }

            const videoResponse = await axios.get(mediaUrl, {
                responseType: "stream",
                timeout: 120000,
                maxRedirects: 3,
                maxContentLength: 100 * 1024 * 1024,
                headers: { "User-Agent": USER_AGENT },
                beforeRedirect: options => {
                    if (options.protocol !== "https:" || !matchesHost(options.hostname, MEDIA_HOSTS)) {
                        throw new Error("Blocked media redirect");
                    }
                }
            });

            const contentLength = Number(videoResponse.headers["content-length"]);
            if (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024) {
                videoResponse.data.destroy();
                return res.status(413).json({
                    success: false,
                    error: "The video exceeds the 100 MB download limit."
                });
            }

            res.status(200);
            res.setHeader("Content-Type", format === "mp3" ? "audio/mpeg" : "video/mp4");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="zhea-gio-tiktok.${format}"`
            );
            res.setHeader("Cache-Control", "no-store");
            if (contentLength > 0) {
                res.setHeader("Content-Length", String(contentLength));
            }

            await pipeline(videoResponse.data, res);
            return;
        }

        res.status(200).json({
            success: true,
            normalizedUrl: cleanUrl,
            title: result.title || "TikTok Video",
            cover: result.cover || "",
            play: result.play,
            music: result.music || "",
            author: result.author || "Unknown",
            quality,
            provider: result.provider,
            isHd: result.isHd,
            downloadUrl: result.play
        });

    } catch (error) {
        console.error(error.message);

        if (res.headersSent) {
            res.destroy();
            return;
        }

        res.status(500).json({
            error: "Unable to process video"
        });
    }
};
