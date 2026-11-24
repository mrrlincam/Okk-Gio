module.exports = async (req, res) => {
    if (req.method !== "GET") {
        return res.status(405).json({ status: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ status: "ok" });
};
