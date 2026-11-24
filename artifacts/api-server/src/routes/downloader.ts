import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DownloadTikTokVideoBody,
  DownloadTikTokVideoResponse,
  GetDownloaderStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const TIKWM_API_URL = "https://www.tikwm.com/api/";
const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

function isTikTokUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && TIKTOK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

router.get("/status", (_req, res) => {
  res.json(
    GetDownloaderStatusResponse.parse({
      success: true,
      message: "ZHEA GIO SERVER ONLINE",
    }),
  );
});

router.get("/download", async (req, res): Promise<void> => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  const requestedQuality = req.query.quality;
  const quality =
    requestedQuality === undefined || requestedQuality === "2k"
      ? "2k"
      : requestedQuality === "standard"
        ? "standard"
        : null;

  if (!isTikTokUrl(url) || !quality) {
    res.status(400).json({
      success: false,
      error: "សូមបញ្ចូលតំណ TikTok និងគុណភាពត្រឹមត្រូវ។",
    });
    return;
  }

  try {
    const apiResponse = await fetch(TIKWM_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        hd: quality === "standard" ? 0 : 1,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!apiResponse.ok) {
      res.status(502).json({
        success: false,
        error: "Server Error ឬ API មិនដំណើរការ!",
      });
      return;
    }

    const payload = asRecord(await apiResponse.json());
    const data = asRecord(payload?.data);
    const videoUrl =
      quality === "standard"
        ? asString(data?.play) || asString(data?.hdplay)
        : asString(data?.hdplay);

    if (!videoUrl) {
      res.status(422).json({
        success: false,
        error:
          "វីដេអូនេះមិនមានស្ទ្រីមគុណភាពខ្ពស់បន្ថែមទេ។ សូមជ្រើសគុណភាពស្តង់ដារ។",
      });
      return;
    }

    const videoResponse = await fetch(videoUrl, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(120_000),
    });

    if (!videoResponse.ok || !videoResponse.body) {
      res.status(502).json({
        success: false,
        error: "មិនអាចទាញយកឯកសារវីដេអូពីប្រភពបានទេ។",
      });
      return;
    }

    const contentLength = videoResponse.headers.get("content-length");
    res.status(200);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="zhea-gio-tiktok.mp4"',
    );
    res.setHeader("Cache-Control", "no-store");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    await pipeline(
      Readable.fromWeb(
        videoResponse.body as import("node:stream/web").ReadableStream,
      ),
      res,
    );
  } catch (error) {
    req.log.error({ err: error }, "TikTok file download failed");
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(502).json({
      success: false,
      error: "មិនអាចទាញយកឯកសារវីដេអូបានទេ។ សូមសាកល្បងម្ដងទៀត។",
    });
  }
});

router.post("/download", async (req, res): Promise<void> => {
  const parsed = DownloadTikTokVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "សូមបញ្ចូល TikTok Link!",
    });
    return;
  }

  if (!isTikTokUrl(parsed.data.url)) {
    res.status(400).json({
      success: false,
      error: "សូមបញ្ចូល TikTok Link ដែលត្រឹមត្រូវ!",
    });
    return;
  }

  try {
    const quality = parsed.data.quality ?? "2k";
    const apiResponse = await fetch(TIKWM_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: parsed.data.url,
        hd: quality === "standard" ? 0 : 1,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!apiResponse.ok) {
      req.log.warn(
        { statusCode: apiResponse.status },
        "TikWM returned an unsuccessful response",
      );
      res.status(502).json({
        success: false,
        error: "Server Error ឬ API មិនដំណើរការ!",
      });
      return;
    }

    const payload = asRecord(await apiResponse.json());
    const data = asRecord(payload?.data);
    if (!data) {
      res.status(400).json({
        success: false,
        error: "រកមិនឃើញវីដេអូ!",
      });
      return;
    }

    const videoUrl =
      quality === "standard"
        ? asString(data.play) || asString(data.hdplay)
        : asString(data.hdplay);
    if (!videoUrl) {
      res.status(422).json({
        success: false,
        error:
          "វីដេអូនេះមិនមានស្ទ្រីមគុណភាពខ្ពស់បន្ថែមទេ។ សូមជ្រើសគុណភាពស្តង់ដារ។",
      });
      return;
    }

    const author = asRecord(data.author);
    const result = DownloadTikTokVideoResponse.parse({
      success: true,
      title: asString(data.title) || "TikTok Video",
      cover: asString(data.cover),
      play: videoUrl,
      music: asString(data.music),
      author: asString(author?.nickname) || "TikTok",
    });

    if (!result.play) {
      res.status(400).json({
        success: false,
        error: "រកមិនឃើញវីដេអូ!",
      });
      return;
    }

    res.json(result);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    req.log.error({ err: error }, "TikWM download request failed");
    res.status(timedOut ? 504 : 502).json({
      success: false,
      error: "Server Error ឬ API មិនដំណើរការ!",
    });
  }
});

export default router;
