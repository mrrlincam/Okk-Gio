import { useState, type FormEvent } from 'react';
import { useDownloadTikTokVideo, useGetDownloaderStatus } from '@workspace/api-client-react';
import { AlertCircle, ArrowDownToLine, Check, Clipboard, ExternalLink, Link2, Music2, ShieldCheck, Sparkles, Video, Wifi } from 'lucide-react';

type TikTokDownloadResult = {
  success: boolean;
  title: string;
  cover: string;
  play: string;
  music: string;
  author: string | { nickname?: string; unique_id?: string; username?: string };
};

type DownloaderError = {
  success: false;
  error: string;
};

function isTikTokUrl(value: string) {
  try {
    const url = new URL(value);
    const hosts = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'];
    return url.protocol === 'https:' && hosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function getAuthorName(author: TikTokDownloadResult['author']) {
  if (typeof author === 'string') return author || 'TikTok creator';
  return author.nickname || author.unique_id || author.username || 'TikTok creator';
}

function getAuthorHandle(author: TikTokDownloadResult['author']) {
  if (typeof author === 'string') return '';
  const handle = author.unique_id || author.username;
  return handle ? `@${handle.replace(/^@/, '')}` : '';
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState<'2k' | 'standard'>('2k');
  const [fieldError, setFieldError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [result, setResult] = useState<TikTokDownloadResult | null>(null);
  const [copied, setCopied] = useState(false);
  const statusQuery = useGetDownloaderStatus();
  const downloadVideo = useDownloadTikTokVideo();

  const status = statusQuery.data as unknown as { success?: boolean; message?: string } | undefined;
  const statusLabel = statusQuery.isLoading
    ? 'Checking service'
    : statusQuery.isError || status?.success === false
      ? 'Service unavailable'
      : status?.success
        ? 'Service ready'
        : 'Service status';
  const statusMode = statusQuery.isLoading
    ? ''
    : statusQuery.isError || status?.success === false
      ? 'is-offline'
      : status?.success
        ? 'is-online'
        : '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    setFieldError('');
    setRequestError('');
    setCopied(false);
    setResult(null);

    if (!trimmed) {
      setFieldError('សូមបិទភ្ជាប់តំណ TikTok ជាមុនសិន។');
      return;
    }
    if (!isTikTokUrl(trimmed)) {
      setFieldError('សូមបញ្ចូលតំណសាធារណៈពី TikTok ដែលត្រឹមត្រូវ។');
      return;
    }

    downloadVideo.mutate(
      { data: { url: trimmed, quality } },
      {
        onSuccess: (response) => {
          const payload = response as unknown as TikTokDownloadResult | DownloaderError;
          if (!payload.success) {
            setRequestError((payload as DownloaderError).error || 'មិនអាចទាញយកវីដេអូនេះបានទេ។ សូមពិនិត្យតំណ ហើយសាកល្បងម្ដងទៀត។');
            return;
          }
          setResult(payload as TikTokDownloadResult);
        },
        onError: (error) => {
          const data = error && typeof error === 'object' && 'data' in error
            ? (error as { data?: unknown }).data
            : undefined;
          const apiMessage =
            data && typeof data === 'object' && 'error' in data
              ? (data as { error?: unknown }).error
              : undefined;
          setRequestError(
            typeof apiMessage === 'string'
              ? apiMessage
              : 'មានបញ្ហាក្នុងការទាក់ទងសេវាកម្ម។ សូមសាកល្បងម្ដងទៀត។',
          );
        },
      },
    );
  }

  async function pasteLink() {
    setFieldError('');
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) {
        setFieldError('មិនមានតំណនៅក្នុង clipboard ទេ។');
        return;
      }
      setUrl(value.trim());
    } catch {
      setFieldError('មិនអាចអាន clipboard បានទេ។ សូមបិទភ្ជាប់តំណដោយដៃ។');
    }
  }

  async function copyMusic() {
    if (!result?.music) return;
    try {
      await navigator.clipboard.writeText(result.music);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setRequestError('មិនអាចចម្លងតំណតន្ត្រីបានទេ។ សូមសាកល្បងម្ដងទៀត។');
    }
  }

  const authorName = result ? getAuthorName(result.author) : '';
  const authorHandle = result ? getAuthorHandle(result.author) : '';

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Zhea Gio home" data-testid="link-home">
          <span className="brand-mark"><Video size={19} strokeWidth={2.2} /></span>
          <span>
            <span className="brand-name">zhea gio</span>
            <span className="brand-sub">tiktok downloader</span>
          </span>
        </a>
        <div className="status-pill" aria-live="polite" data-testid="status-api">
          <span className={`status-dot ${statusMode}`} />
          <span>{statusLabel}</span>
        </div>
      </header>

      <main className="page-main">
        <section className="intro">
          <div className="eyebrow"><Sparkles size={12} /> MADE FOR EVERYDAY SAVES</div>
          <h1>វីដេអូល្អៗ<br /><span>រក្សាទុកបានងាយ។</span></h1>
          <p>បិទភ្ជាប់តំណ TikTok សាធារណៈ ដើម្បីមើលព័ត៌មានវីដេអូ និងទាញយកដោយផ្ទាល់។ លឿន សាមញ្ញ និងឥតគិតថ្លៃ។</p>
        </section>

        <section className="download-panel" aria-label="TikTok video downloader">
          <form onSubmit={submit} noValidate>
            <label className="input-label" htmlFor="tiktok-url">
              <span>តំណវីដេអូ TikTok</span>
              <small>PUBLIC VIDEOS ONLY</small>
            </label>
            <div className="url-field">
              <Link2 className="url-icon" size={18} />
              <input
                id="tiktok-url"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (fieldError) setFieldError('');
                }}
                placeholder="https://www.tiktok.com/@creator/video/..."
                autoComplete="url"
                aria-invalid={!!fieldError}
                aria-describedby={fieldError ? 'url-error' : undefined}
                data-testid="input-tiktok-url"
              />
              <button className="paste-button" type="button" onClick={pasteLink} data-testid="button-paste-link">
                <Clipboard size={14} /> បិទភ្ជាប់
              </button>
            </div>
            {fieldError && <p className="form-error" id="url-error" role="alert" data-testid="error-url-validation">{fieldError}</p>}
            <div className="quality-control">
              <label htmlFor="video-quality">គុណភាពវីដេអូ MP4</label>
              <select
                id="video-quality"
                value={quality}
                onChange={(event) => setQuality(event.target.value as '2k' | 'standard')}
                data-testid="select-video-quality"
              >
                <option value="2k">2K — គុណភាពខ្ពស់បំផុត (ប្រសិនបើមាន)</option>
                <option value="standard">ស្តង់ដារ — ទាញយកលឿនជាង</option>
              </select>
              <p className="quality-note" id="quality-note">ជម្រើស 2K ប្រើតំណ HD ប្រសិនបើមាន។ បើប្រភពមិនមាន HD សូមជ្រើសគុណភាពស្តង់ដារ។</p>
            </div>
            <button className="submit-button" type="submit" disabled={downloadVideo.isPending} data-testid="button-get-video">
              {downloadVideo.isPending ? (
                <>កំពុងស្វែងរកវីដេអូ <span className="button-dots" aria-hidden="true">···</span></>
              ) : (
                <>ស្វែងរកវីដេអូ <ArrowDownToLine size={17} /></>
              )}
            </button>
            <p className="form-note"><ShieldCheck size={13} /> ទាញយកតំណសាធារណៈប៉ុណ្ណោះ · មិនរក្សាទុកទិន្នន័យរបស់អ្នកទេ</p>
          </form>
        </section>

        {downloadVideo.isPending && (
          <section className="loading-card" aria-live="polite" aria-label="Loading video details" data-testid="loading-video-details">
            <div className="skeleton skeleton-cover" />
            <div style={{ paddingTop: 13 }}>
              <div className="skeleton skeleton-line short" />
              <div className="skeleton skeleton-line long" />
              <div className="skeleton skeleton-line short" style={{ marginTop: 26 }} />
            </div>
          </section>
        )}

        {requestError && !downloadVideo.isPending && (
          <section className="error-card" role="alert" data-testid="error-download">
            <AlertCircle size={19} />
            <div>
              <strong>មិនអាចទាញយកគុណភាពដែលបានជ្រើសបានទេ</strong>
              <p>{requestError}</p>
            </div>
          </section>
        )}

        {result && !downloadVideo.isPending && (
          <section className="result-card" aria-live="polite" data-testid="result-video-details">
            <div className="cover-wrap">
              {result.cover ? <img src={result.cover} alt={`Cover for ${result.title || 'TikTok video'}`} data-testid="img-video-cover" /> : null}
              <span className="cover-stamp">VIDEO FOUND</span>
            </div>
            <div className="result-body">
              <span className="result-kicker">VIDEO DETAILS</span>
              <h2 className="result-title" data-testid="text-video-title">{result.title || 'TikTok video'}</h2>
              <div className="creator-row">
                <span className="creator-avatar">{authorName.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong data-testid="text-video-author">{authorName}</strong>
                  <span>{authorHandle || 'TikTok creator'}</span>
                </div>
              </div>
              <div className="result-divider" />
              <div className="result-actions">
                {result.play ? (
                  <a className="action-link primary-action" href={result.play} download target="_blank" rel="noreferrer" data-testid="link-download-video">
                    <ArrowDownToLine size={15} /> ទាញយកវីដេអូ
                  </a>
                ) : (
                  <span className="action-button" aria-disabled="true">គ្មានតំណវីដេអូ</span>
                )}
                {result.music && (
                  <a className="action-link" href={result.music} target="_blank" rel="noreferrer" data-testid="link-open-music">
                    <Music2 size={15} /> បើកតន្ត្រី <ExternalLink size={12} />
                  </a>
                )}
                {result.music && (
                  <button className="action-button" type="button" onClick={copyMusic} data-testid="button-copy-music">
                    {copied ? <Check size={14} /> : <Clipboard size={14} />}
                    {copied ? 'បានចម្លង' : 'ចម្លងតំណតន្ត្រី'}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {!result && !downloadVideo.isPending && !requestError && (
          <section className="how-section" aria-label="How to download">
            <div className="how-heading">
              <h2>របៀបប្រើប្រាស់</h2>
              <span>THREE SIMPLE STEPS</span>
            </div>
            <div className="steps">
              <div className="step">
                <span className="step-number">01</span>
                <div><strong>ចម្លងតំណ</strong><p>ចម្លងតំណពីវីដេអូ TikTok ដែលអ្នកចង់រក្សាទុក។</p></div>
              </div>
              <div className="step">
                <span className="step-number">02</span>
                <div><strong>បិទភ្ជាប់ទីនេះ</strong><p>ដាក់តំណនៅក្នុងប្រអប់ខាងលើ ហើយចុចស្វែងរក។</p></div>
              </div>
              <div className="step">
                <span className="step-number">03</span>
                <div><strong>រក្សាទុកវីដេអូ</strong><p>មើលព័ត៌មាន រួចទាញយកវីដេអូ ឬតន្ត្រី។</p></div>
              </div>
            </div>
          </section>
        )}

        {statusQuery.isError && (
          <p className="form-note" role="status" data-testid="status-api-error">
            <Wifi size={13} /> សេវាកម្មកំពុងមានបញ្ហា។ អ្នកនៅតែអាចសាកល្បងដាក់តំណម្ដងទៀត។
          </p>
        )}
      </main>

      <footer className="site-footer">
        <span className="footer-brand">zhea gio</span>
        <span className="footer-note"><ShieldCheck size={13} /> សម្រាប់ការប្រើប្រាស់ផ្ទាល់ខ្លួន · គោរពសិទ្ធិអ្នកបង្កើត</span>
      </footer>
    </div>
  );
}
