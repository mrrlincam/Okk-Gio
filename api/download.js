const axios = require("axios");

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const { url, quality = "2k" } = req.body || {};

        if (!['2k', 'standard'].includes(quality)) {
            return res.status(400).json({
                success: false,
                error: "Invalid quality option"
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

        if (!videoUrl) {
            return res.status(422).json({
                success: false,
                error: "This video has no HD/2K source. Choose standard quality instead."
            });
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

        res.status(500).json({
            error: "Unable to process video"
        });
    }
};
