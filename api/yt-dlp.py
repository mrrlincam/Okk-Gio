import json
import os
import re
import tempfile
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import imageio_ffmpeg
import yt_dlp

MAX_VIDEO_BYTES = 100 * 1024 * 1024
FORMAT_SELECTOR = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"


def is_tiktok_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower().rstrip(".")
        return (
            parsed.scheme == "https"
            and (hostname == "tiktok.com" or hostname.endswith(".tiktok.com"))
        )
    except ValueError:
        return False


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        query = parse_qs(urlsplit(self.path).query)
        video_url = query.get("url", [""])[0].strip()

        if not video_url or len(video_url) > 2048 or not is_tiktok_url(video_url):
            send_json(self, 400, {"error": "Enter a valid public TikTok URL."})
            return

        response_started = False
        try:
            with tempfile.TemporaryDirectory(prefix="zhea-gio-") as output_dir:
                options = {
                    "format": FORMAT_SELECTOR,
                    "merge_output_format": "mp4",
                    "recodevideo": "mp4",
                    "outtmpl": os.path.join(output_dir, "%(id)s.%(ext)s"),
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                    "no_color": True,
                    "restrictfilenames": True,
                    "max_filesize": MAX_VIDEO_BYTES,
                    "socket_timeout": 30,
                    "retries": 2,
                    "fragment_retries": 2,
                    "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
                }

                with yt_dlp.YoutubeDL(options) as ydl:
                    info = ydl.extract_info(video_url, download=True)

                files = list(Path(output_dir).glob("*"))
                video_path = next(
                    (
                        path
                        for path in files
                        if path.is_file() and path.suffix.lower() == ".mp4"
                    ),
                    None,
                )
                if video_path is None:
                    video_path = next((path for path in files if path.is_file()), None)
                if video_path is None:
                    send_json(self, 502, {"error": "The source did not produce a video file."})
                    return

                file_size = video_path.stat().st_size
                if file_size > MAX_VIDEO_BYTES:
                    send_json(self, 413, {"error": "The video exceeds the 100 MB download limit."})
                    return

                video_id = re.sub(
                    r"[^A-Za-z0-9_-]", "", str(info.get("id") or "video")
                )[:80]
                filename = (
                    f"zhea-gio-{video_id or 'video'}{video_path.suffix.lower()}"
                )
                self.send_response(200)
                content_type = (
                    "video/mp4"
                    if video_path.suffix.lower() == ".mp4"
                    else "application/octet-stream"
                )
                self.send_header("Content-Type", content_type)
                self.send_header(
                    "Content-Disposition", f'attachment; filename="{filename}"'
                )
                self.send_header("Content-Length", str(file_size))
                self.send_header("Cache-Control", "no-store")
                width = info.get("width")
                height = info.get("height")
                fps = info.get("fps")
                if isinstance(width, int) and isinstance(height, int):
                    self.send_header("X-Video-Resolution", f"{width}x{height}")
                if isinstance(fps, (int, float)):
                    self.send_header("X-Video-FPS", str(fps))
                self.end_headers()
                response_started = True

                with video_path.open("rb") as video_file:
                    while chunk := video_file.read(64 * 1024):
                        self.wfile.write(chunk)
        except BrokenPipeError:
            return
        except Exception as error:
            print(f"yt-dlp download failed: {type(error).__name__}")
            if not response_started:
                send_json(self, 502, {"error": "Unable to download the highest-quality TikTok stream."})

    def log_message(self, format: str, *args: object) -> None:
        return
