const axios = require("axios");
const { pipeline } = require("node:stream/promises");

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

        const parsed = new URL(url);

        if (
            !["tiktok.com"].some(host =>
                parsed.hostname === host ||
                parsed.hostname.endsWith("." + host)
            ) ||
            !["http:", "https:"].includes(parsed.protocol)
        ) {
            return res.status(400).json({
                error: "Invalid TikTok URL"
            });
        }

        const response = await axios.post(
            "https://www.tikwm.com/api/",
            new URLSearchParams({
                url: url,
                hd: quality === "standard" ? "0" : "1"
            }),
            {
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0"
                },
                timeout: 30000
            }
        );

        const data = response.data.data;

        if (response.data.code !== 0 || !data) {
            throw new Error("Video not found");
        }

        const videoUrl =
            quality === "standard"
                ? data.play || data.hdplay
                : data.hdplay;

        const mediaUrl = isFileDownload && format === "mp3" ? data.music : videoUrl;

        if (!mediaUrl) {
            return res.status(422).json({
                success: false,
                error: format === "mp3"
                    ? "This video has no downloadable music source."
                    : "This video has no higher-quality source stream. Choose standard quality instead."
            });
        }

        if (isFileDownload) {
            const videoResponse = await axios.get(mediaUrl, {
                responseType: "stream",
                timeout: 120000,
                maxRedirects: 3,
                maxContentLength: 100 * 1024 * 1024,
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            res.status(200);
            res.setHeader("Content-Type", format === "mp3" ? "audio/mpeg" : "video/mp4");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="zhea-gio-tiktok.${format}"`
            );
            res.setHeader("Cache-Control", "no-store");
            if (videoResponse.headers["content-length"]) {
                res.setHeader("Content-Length", videoResponse.headers["content-length"]);
            }

            await pipeline(videoResponse.data, res);
            return;
        }

        res.status(200).json({
            success: true,
            title: data.title || "TikTok Video",
            cover: data.cover || "",
            play: videoUrl,
            music: data.music || "",
            author: data.author?.nickname || "Unknown",
            quality,
            downloadUrl: videoUrl
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
