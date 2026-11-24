const axios = require("axios");

module.exports = async (req, res) => {
    try {
        if (req.method !== "GET") {
            return res.status(405).send("Method not allowed");
        }

        const videoUrl = req.query.url;

        if (!videoUrl) {
            return res.status(400).send("Missing URL");
        }

        const parsed = new URL(videoUrl);

        const allowed = [
            "tiktok.com",
            "tiktokcdn.com",
            "tiktokv.com",
            "byteoversea.com",
            "ibytedtos.com",
            "tikwm.com"
        ];

        const valid = allowed.some(host =>
            parsed.hostname === host ||
            parsed.hostname.endsWith("." + host)
        );

        if (parsed.protocol !== "https:" || !valid) {
            return res.status(400).send("Invalid video source");
        }

        const response = await axios.get(videoUrl, {
            responseType: "stream",
            timeout: 60000,
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        res.setHeader("Content-Type", "video/mp4");

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="ZHEA-GIO.mp4"'
        );

        response.data.pipe(res);

    } catch (error) {
        console.error(error.message);

        if (!res.headersSent) {
            res.status(500).send("Download failed");
        }
    }
};