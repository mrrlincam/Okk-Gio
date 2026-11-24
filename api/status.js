module.exports = async (req, res) => {
    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            message: "Method not allowed"
        });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
        success: true,
        message: "Downloader API is available."
    });
};
