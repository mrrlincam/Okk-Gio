import { Router, type IRouter } from "express";
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

    const author = asRecord(data.author);
    const videoUrl =
      quality === "standard"
        ? asString(data.play) || asString(data.hdplay)
        : asString(data.hdplay) || asString(data.play);
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
