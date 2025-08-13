const { useEffect, useMemo, useState } = React;

// --- 配色トークン（YouTubeライク） ---
const COLORS = {
  bg: "#FFFFFF",
  text: "#0F0F0F",
  muted: "#606060",
  line: "#E5E5E5",
  accent: "#FF0000",
  accentPress: "#CC0000",
  focus: "#1A73E8",
};

// --- 型定義 ---
interface VideoRow {
  videoId;
  title;
  channelId;
  channelTitle;
  publishedAt;
  viewCount: number;
  likeCount?: number;
  thumbnailUrl;
  videoUrl;
  channelUrl;
  subscriberCount?: number;
  hiddenSubscriberCount?: boolean;
  country?;
  matchedRule: "3x" | "2x" | "1x" | "minViews" | "none";
  isShort?: boolean; // Shorts 判定
}

interface CommentRow {
  videoId;
  commentId;
  parentId?;
  authorDisplayName;
  textOriginal;
  likeCount: number;
  publishedAt;
  updatedAt?;
}

const COUNTRY_OPTIONS: { code; label }[] = [
  { code: "", label: "指定なし" },
  { code: "JP", label: "日本" },
  { code: "US", label: "アメリカ" },
  { code: "IN", label: "インド" },
  { code: "GB", label: "イギリス" },
  { code: "DE", label: "ドイツ" },
  { code: "FR", label: "フランス" },
  { code: "BR", label: "ブラジル" },
  { code: "KR", label: "韓国" },
];

type PeriodKey = "3y" | "2y" | "1y" | "6m";
type ShortsMode = "exclude" | "include" | "only"; // 既定 exclude
type RatioThreshold = 1 | 2 | 3; // 登録者比のしきい値

// --- ユーティリティ ---
const storeKey = (k) => localStorage.setItem("yt_api_key", k);
const loadKey = () => localStorage.getItem("yt_api_key") || "";

function calcPublishedAfter(period) {
  const d = new Date();
  if (period === "6m") d.setMonth(d.getMonth() - 6);
  else if (period === "1y") d.setFullYear(d.getFullYear() - 1);
  else if (period === "2y") d.setFullYear(d.getFullYear() - 2);
  else d.setFullYear(d.getFullYear() - 3);
  return d.toISOString();
}

// ISO8601期間(PT#H#M#S) → 秒
function durationToSeconds(iso?): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  const h = Number(m[1] || 0);
  const mi = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + mi * 60 + s;
}

function numberFormat(n?: number) {
  if (typeof n !== "number") return "-";
  return new Intl.NumberFormat("ja-JP").format(n);
}

// CSV生成（テスト可能な純関数）
function buildCSV(
  headers,
  rows,
  selector: (row, key) => any
) {
  const escape = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };
  return [headers.map((h) => `"${h}"`).join(",")]
    .concat(rows.map((r) => headers.map((key) => escape(selector(r, key))).join(",")))
    .join("\n");
}

function downloadCSV(filename, rows, headers, selector) {
  const csv = buildCSV(headers, rows, selector);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function testApiKey(key): Promise<{ ok: boolean; reason? }> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&key=${encodeURIComponent(key)}&maxResults=1`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: body?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "Network error" };
  }
}

// Shorts 判定の強化（60秒以下 もしくは #shorts タグ/ハッシュ）
function isShortByHeuristic(v) {
  const durationSec = durationToSeconds(v?.contentDetails?.duration);
  const shortByTime = typeof durationSec === "number" && durationSec <= 61; // 余裕を1秒持たせる
  const title = (v?.snippet?.title || "");
  const description = (v?.snippet?.description || "");
  const tags = Array.isArray(v?.snippet?.tags) ? v.snippet.tags : [];
  const hasHashShorts = /#shorts/i.test(title) || /#shorts/i.test(description) || tags.some((t) => /shorts/i.test(t));
  return shortByTime || hasHashShorts;
}

// 比率しきい値の判定（テストしやすい純関数）
function qualifiesByRatio(viewCount, subscriberCount, hidden, multiple) {
  if (hidden) return false;
  if (typeof subscriberCount !== "number") return false;
  return viewCount >= multiple * subscriberCount;
}

// --- メインコンポーネント ---
export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [keyVerified, setKeyVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [query, setQuery] = useState("");
  const [minViews, setMinViews] = useState("10000"); // 既定 10000
  const [country, setCountry] = useState("");
  const [pageSize, setPageSize] = useState(50); // 50 既定、20、10
  const [includeHidden, setIncludeHidden] = useState(false);
  const [period, setPeriod] = useState("3y"); // 3年 既定
  const [shortsMode, setShortsMode] = useState("exclude"); // 既定: 含めない
  const [ratioThreshold, setRatioThreshold] = useState(3); // 既定: 3倍

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState([]);

  const [commentsLoadingFor, setCommentsLoadingFor] = useState(null);
  const [commentsByVideo, setCommentsByVideo] = useState({});
  const [selected, setSelected] = useState({});
  const [testReport, setTestReport] = useState([]); // 簡易テストレポート

  // 初期ロードでlocalStorageからAPIキー復元 + セルフテスト
  useEffect(() => {
    const k = loadKey();
    if (k) setApiKey(k);
    runSelfTests();
  }, []);

  const onSaveKey = async () => {
    setVerifying(true);
    setVerifyError("");
    const result = await testApiKey(apiKey.trim());
    setVerifying(false);
    if (result.ok) {
      storeKey(apiKey.trim());
      setKeyVerified(true);
    } else {
      setKeyVerified(false);
      setVerifyError(result.reason || "");
    }
  };

  const publishedAfter = useMemo(() => calcPublishedAfter(period), [period]);

  async function runSearch() {
    setLoading(true);
    setError("");
    setVideos([]);
    setSelected({});
    try {
      const q = query.trim() || "薄毛 対策 シャンプー"; // 空でもデフォ入力相当
      if (!apiKey) throw new Error("APIキーを入力してください。");

      // search.list
      const searchParams = new URLSearchParams({
        key: apiKey,
        part: "snippet",
        type: "video",
        maxResults: String(pageSize),
        q,
        publishedAfter,
        order: "relevance",
      });
      if (country) {
        // 地域関連性を高める
        searchParams.set("regionCode", country.toUpperCase());
      }
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
      const sres = await fetch(searchUrl);
      if (!sres.ok) {
        const body = await sres.json().catch(() => ({}));
        throw new Error(body?.error?.message || `search.list HTTP ${sres.status}`);
      }
      const sjson = await sres.json();
      const items[] = sjson.items || [];
      const videoIds = items.map((it) => it?.id?.videoId).filter(Boolean);
      if (videoIds.length === 0) {
        setVideos([]);
        setLoading(false);
        return;
      }

      // videos.list（Shorts判定強化のため、snippet.description/tagsも利用）
      const vparams = new URLSearchParams({
        key: apiKey,
        part: "snippet,statistics,contentDetails",
        id: videoIds.join(","),
        maxResults: String(videoIds.length),
      });
      const vurl = `https://www.googleapis.com/youtube/v3/videos?${vparams.toString()}`;
      const vres = await fetch(vurl);
      if (!vres.ok) {
        const body = await vres.json().catch(() => ({}));
        throw new Error(body?.error?.message || `videos.list HTTP ${vres.status}`);
      }
      const vjson = await vres.json();

      const channelIds = Array.from(
        new Set((vjson.items || []).map((v) => v?.snippet?.channelId).filter(Boolean))
      );

      // channels.list
      const cparams = new URLSearchParams({
        key: apiKey,
        part: "snippet,statistics",
        id: channelIds.join(","),
        maxResults: String(channelIds.length),
      });
      const curl = `https://www.googleapis.com/youtube/v3/channels?${cparams.toString()}`;
      const cres = await fetch(curl);
      if (!cres.ok) {
        const body = await cres.json().catch(() => ({}));
        throw new Error(body?.error?.message || `channels.list HTTP ${cres.status}`);
      }
      const cjson = await cres.json();
      const channelMap = {};
      for (const c of cjson.items || []) channelMap[c.id] = c;

      const minViewsNum = Number(minViews || 0);

      const rows = (vjson.items || [])
        .map((v) => {
          const ch = channelMap[v?.snippet?.channelId];
          const subCount = ch?.statistics?.subscriberCount ? Number(ch.statistics.subscriberCount) : undefined;
          const hidden = Boolean(ch?.statistics?.hiddenSubscriberCount);
          const countryCode = ch?.snippet?.country || undefined;
          const vc = v?.statistics?.viewCount ? Number(v.statistics.viewCount) : 0;
          const lc = v?.statistics?.likeCount ? Number(v.statistics.likeCount) : undefined;
          const qualifiesRatio = qualifiesByRatio(vc, subCount, hidden, ratioThreshold);
          const qualifiesByMin = vc >= minViewsNum;
          const matchedRule["matchedRule"] = qualifiesRatio
            ? ((`${ratioThreshold}x`) as VideoRow["matchedRule"])
            : qualifiesByMin
            ? "minViews"
            : "none";
          const isShort = isShortByHeuristic(v); // 強化版判定
          return {
            videoId: v.id,
            title: v.snippet?.title || "",
            channelId: v.snippet?.channelId || "",
            channelTitle: v.snippet?.channelTitle || "",
            publishedAt: v.snippet?.publishedAt || "",
            viewCount: vc,
            likeCount: lc,
            thumbnailUrl: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
            videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
            channelUrl: `https://www.youtube.com/channel/${v.snippet?.channelId}`,
            subscriberCount: subCount,
            hiddenSubscriberCount: hidden,
            country: countryCode,
            matchedRule,
            isShort,
          } as VideoRow;
        })
        .filter((r) => {
          const countryOk = country ? r.country?.toUpperCase() === country.toUpperCase() : true;
          const viewsOk = r.viewCount >= Number(minViews || 0);
          const shortsOk = shortsMode === "include" ? true : shortsMode === "only" ? !!r.isShort : !r.isShort;
          // includeHidden=false → 比率しきい値で判定、true → 最低再生数のみ
          return countryOk && shortsOk && (includeHidden ? viewsOk : r.matchedRule === `${ratioThreshold}x`);
        })
        .sort((a, b) => b.viewCount - a.viewCount);

      setVideos(rows);
    } catch (e) {
      setError(e?.message || "検索に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllComments(videoId) {
    if (!apiKey) return;
    setCommentsLoadingFor(videoId);
    try {
      const all = [];
      let pageToken = undefined;
      do {
        const params = new URLSearchParams({
          key: apiKey,
          part: "snippet,replies",
          videoId,
          maxResults: "100",
          textFormat: "plainText",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const url = `https://www.googleapis.com/youtube/v3/commentThreads?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message || `commentThreads.list HTTP ${res.status}`);
        }
        const json = await res.json();
        for (const th of json.items || []) {
          const tlc = th?.snippet?.topLevelComment;
          if (tlc) {
            all.push({
              videoId,
              commentId: tlc.id,
              parentId: null,
              authorDisplayName: tlc.snippet?.authorDisplayName || "",
              textOriginal: tlc.snippet?.textDisplay || tlc.snippet?.textOriginal || "",
              likeCount: tlc.snippet?.likeCount || 0,
              publishedAt: tlc.snippet?.publishedAt || "",
              updatedAt: tlc.snippet?.updatedAt || "",
            });
          }
          const replies = th?.replies?.comments || [];
          for (const rc of replies) {
            all.push({
              videoId,
              commentId: rc.id,
              parentId: rc.snippet?.parentId || tlc?.id || undefined,
              authorDisplayName: rc.snippet?.authorDisplayName || "",
              textOriginal: rc.snippet?.textDisplay || rc.snippet?.textOriginal || "",
              likeCount: rc.snippet?.likeCount || 0,
              publishedAt: rc.snippet?.publishedAt || "",
              updatedAt: rc.snippet?.updatedAt || "",
            });
          }
        }
        pageToken = json.nextPageToken;
      } while (pageToken);
      setCommentsByVideo((prev) => ({ ...prev, [videoId]: all }));
    } catch (e) {
      alert(e?.message || "コメント取得に失敗しました");
    } finally {
      setCommentsLoadingFor(null);
    }
  }

  function exportVideosCSV() {
    const headers = [
      "videoId",
      "title",
      "channelId",
      "channelTitle",
      "publishedAt",
      "viewCount",
      "subscriberCount",
      "likeCount",
      "country",
      "videoUrl",
      "thumbnailUrl",
      "matchedRule",
      "keywords",
      "searchedAt",
    ];
    const now = new Date().toISOString();
    const ratioLabel = `${ratioThreshold}x`;
    downloadCSV(
      `videos_${now}.csv`,
      videos,
      headers,
      (r, key) => {
        switch (key) {
          case "videoId":
            return r.videoId;
          case "title":
            return r.title;
          case "channelId":
            return r.channelId;
          case "channelTitle":
            return r.channelTitle;
          case "publishedAt":
            return r.publishedAt;
          case "viewCount":
            return r.viewCount;
          case "subscriberCount":
            return r.subscriberCount ?? "";
          case "likeCount":
            return r.likeCount ?? "";
          case "country":
            return r.country ?? "";
          case "videoUrl":
            return r.videoUrl;
          case "thumbnailUrl":
            return r.thumbnailUrl;
          case "matchedRule":
            return r.matchedRule || ratioLabel;
          case "keywords":
            return query.trim() || "薄毛 対策 シャンプー";
          case "searchedAt":
            return now;
          default:
            return "";
        }
      }
    );
  }

  function exportSelectedCommentsCSV() {
    const videoIds = Object.keys(selected).filter((id) => selected[id]);
    const rows = videoIds.flatMap((id) => commentsByVideo[id] || []);
    if (!rows.length) {
      alert("選択中の動画に取得済みコメントがありません。各行の『コメント取得』を実行してください。");
      return;
    }
    const headers = [
      "videoId",
      "commentId",
      "parentId",
      "authorDisplayName",
      "textOriginal",
      "likeCount",
      "publishedAt",
      "updatedAt",
    ];
    const now = new Date().toISOString();
    downloadCSV(
      `comments_selected_${now}.csv`,
      rows,
      headers,
      (r, key) => (r)[key]
    );
  }

  function exportCommentsCSV(videoId) {
    const rows = commentsByVideo[videoId] || [];
    if (!rows.length) {
      alert("先にコメントを取得してください。");
      return;
    }
    const headers = [
      "videoId",
      "commentId",
      "parentId",
      "authorDisplayName",
      "textOriginal",
      "likeCount",
      "publishedAt",
      "updatedAt",
    ];
    const now = new Date().toISOString();
    downloadCSV(
      `comments_${videoId}_${now}.csv`,
      rows,
      headers,
      (r, key) => (r)[key]
    );
  }

  // --- 簡易セルフテスト（起動時に一度実行） ---
  function runSelfTests() {
    const logs = [];
    try {
      // buildCSV の改行とエスケープ
      const h = ["a", "b"]; const rows = [{ a: '1,2', b: '"q"' }];
      const csv = buildCSV(h, rows, (r, k) => (r)[k]);
      if (!csv.includes('\n')) throw new Error('CSV に改行が含まれません');
      if (!csv.includes('"1,2"')) throw new Error('カンマのエスケープに失敗');
      if (!csv.includes('""q""')) throw new Error('ダブルクォートのエスケープに失敗');
      logs.push('CSV 生成: OK');

      // durationToSeconds と Shorts 判定（強化版）
      const d45 = durationToSeconds('PT45S');
      const d61 = durationToSeconds('PT1M1S');
      if (d45 !== 45 || d61 !== 61) throw new Error('duration 変換に失敗');
      const mockV1 = { snippet: { title: 'test', description: '', tags: [] }, contentDetails: { duration: 'PT45S' } };
      const mockV2 = { snippet: { title: 'test #Shorts', description: '', tags: [] }, contentDetails: { duration: 'PT2M' } };
      const mockV3 = { snippet: { title: 'test', description: 'no hash', tags: [] }, contentDetails: { duration: 'PT2M' } };
      if (!(isShortByHeuristic(mockV1) && isShortByHeuristic(mockV2) && !isShortByHeuristic(mockV3))) {
        throw new Error('Shorts 強化判定に失敗');
      }
      logs.push('Shorts 判定: OK');

      // calcPublishedAfter 概ね過去日であること
      const now = Date.now();
      const d6m = new Date(calcPublishedAfter('6m')).getTime();
      if (!(d6m < now)) throw new Error('publishedAfter が未来を指しています');
      logs.push('calcPublishedAfter: OK');

      // 比率しきい値の判定
      if (!(qualifiesByRatio(2500, 1000, false, 2) && !qualifiesByRatio(2500, 1000, false, 3))) {
        throw new Error('比率しきい値 2x/3x 判定に失敗');
      }
      if (qualifiesByRatio(2500, undefined, false, 1)) throw new Error('登録者数未取得でも合格になっています');
      if (qualifiesByRatio(2500, 1000, true, 1)) throw new Error('非公開登録者でも合格になっています');
      logs.push('比率しきい値: OK');

      setTestReport([`✅ セルフテスト成功 (${new Date().toLocaleString()})`, ...logs]);
    } catch (e) {
      setTestReport([`❌ セルフテスト失敗: ${e?.message}`]);
      // 続行は可能
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg, color: COLORS.text }}>
      {/* ヘッダー（APIキー入力を配置） */}
      <header className="sticky top-0 z-10 border-b bg-white" style={{ borderColor: COLORS.line }}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-sm" style={{ backgroundColor: COLORS.accent }} />
          <h1 className="text-xl font-semibold">YouTube運用支援ツール</h1>
          <span className="ml-2 text-sm text-neutral-500">MVP</span>
          <div className="ml-auto flex items-center gap-2">
            <input
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none w-64"
              style={{ borderColor: COLORS.line }}
              type="password"
              placeholder="APIキーを入力"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              onClick={onSaveKey}
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-white text-sm"
              style={{ backgroundColor: COLORS.accent }}
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle2 className="w-4 h-4"/>}
              保存/疎通
            </button>
            {keyVerified ? (
              <span className="inline-flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="w-4 h-4"/>有効</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-neutral-500"><AlertTriangle className="w-4 h-4"/>未設定</span>
            )}
          </div>
        </div>
        {verifyError && (
          <div className="mx-auto max-w-6xl px-4 pb-2 text-sm text-red-600">{verifyError}</div>
        )}
      </header>

      {/* 検索カード */}
      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="border rounded-xl p-4" style={{ borderColor: COLORS.line }}>
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="w-5 h-5"/>
            <h2 className="text-lg font-semibold">検索条件</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-sm text-neutral-600">キーワード</label>
              <input
                className="w-full border rounded-lg px-3 py-2 focus:outline-none"
                style={{ borderColor: COLORS.line }}
                placeholder="例: 薄毛 対策 シャンプー"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-600">最低再生数（既定 10000）</label>
              <input
                className="w-full border rounded-lg px-3 py-2 focus:outline-none"
                style={{ borderColor: COLORS.line }}
                type="number"
                min={0}
                placeholder="10000"
                value={minViews}
                onChange={(e) => setMinViews(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-600">国指定</label>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-neutral-500"/>
                <select
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
                  style={{ borderColor: COLORS.line }}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRY_OPTIONS.map(opt => (
                    <option key={opt.code} value={opt.code}>{opt.label}{opt.code ? `（${opt.code}）` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm text-neutral-600">対象期間</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
                style={{ borderColor: COLORS.line }}
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              >
                <option value="3y">直近3年（既定）</option>
                <option value="2y">直近2年</option>
                <option value="1y">直近1年</option>
                <option value="6m">直近半年</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-neutral-600">取得件数</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg白"
                style={{ borderColor: COLORS.line }}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={50}>50（既定）</option>
                <option value={20}>20</option>
                <option value={10}>10</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-neutral-600">ショートの扱い</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
                style={{ borderColor: COLORS.line }}
                value={shortsMode}
                onChange={(e) => setShortsMode(e.target.value as ShortsMode)}
              >
                <option value="exclude">ショートを含めない（既定）</option>
                <option value="include">ショートを含める</option>
                <option value="only">ショートのみ</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-neutral-600">登録者比しきい値</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
                style={{ borderColor: COLORS.line }}
                value={ratioThreshold}
                onChange={(e) => setRatioThreshold(Number(e.target.value) as RatioThreshold)}
              >
                <option value={3}>3倍以上（既定）</option>
                <option value={2}>2倍以上</option>
                <option value={1}>1倍以上</option>
              </select>
            </div>
            <div className="col-span-1 md:col-span-2 lg:col-span-4 flex items-center gap-3">
              <input id="includeHidden" type="checkbox" className="w-4 h-4" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)}/>
              <label htmlFor="includeHidden" className="text-sm">登録者数非公開チャンネルも含める（この場合は最低再生数のみで判定）</label>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runSearch}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: COLORS.accent }}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
              検索
            </button>
            <button
              onClick={exportVideosCSV}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border"
              style={{ borderColor: COLORS.line }}
              disabled={!videos.length}
            >
              <Download className="w-4 h-4"/>
              一覧CSV出力
            </button>
            <button
              onClick={exportSelectedCommentsCSV}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border"
              style={{ borderColor: COLORS.line }}
              disabled={!Object.values(selected).some(Boolean)}
            >
              <Download className="w-4 h-4"/>
              選択コメントCSV出力
            </button>
            <span className="text-sm text-neutral-500">対象期間は {new Date(publishedAfter).toLocaleDateString()} 以降</span>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </section>

      {/* 結果一覧 */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: COLORS.line }}>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr className="text-left">
                <th className="p-3 border-b w-10" style={{ borderColor: COLORS.line }}></th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>サムネ</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>タイトル</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>チャンネル</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>再生数</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>登録者数</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>高評価</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>公開日</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>国</th>
                <th className="p-3 border-b" style={{ borderColor: COLORS.line }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="p-6 text-center text-neutral-500" colSpan={10}>読み込み中...</td></tr>
              )}
              {!loading && videos.length === 0 && (
                <tr><td className="p-6 text-center text-neutral-500" colSpan={10}>結果はありません。</td></tr>
              )}
              {!loading && videos.map(v => (
                <React.Fragment key={v.videoId}>
                  <tr className="hover:bg-neutral-50 border-t" style={{ borderColor: COLORS.line }}>
                    <td className="p-2 align-middle" style={{ verticalAlign: 'middle' }}>
                      <input
                        type="checkbox"
                        checked={!!selected[v.videoId]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [v.videoId]: e.target.checked }))}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="p-2">
                      <a href={v.videoUrl} target="_blank" rel="noreferrer">
                        {/* 16:9 アスペクト比でサムネ固定 */}
                        <div className="relative w-32" style={{ aspectRatio: '16 / 9' }}>
                          <img src={v.thumbnailUrl} alt={v.title} className="absolute inset-0 w-full h-full object-cover rounded"/>
                        </div>
                      </a>
                    </td>
                    <td className="p-2 align-top">
                      <a href={v.videoUrl} target="_blank" rel="noreferrer" className="hover:underline">{v.title}</a>
                      {v.isShort ? <span className="ml-2 text-[10px] text白 px-1.5 py-0.5 rounded" style={{ backgroundColor: COLORS.accent, color: '#fff' }}>Shorts</span> : null}
                    </td>
                    <td className="p-2 align-top">
                      <a href={v.channelUrl} target="_blank" rel="noreferrer" className="hover:underline">{v.channelTitle}</a>
                    </td>
                    <td className="p-2 align-top">{numberFormat(v.viewCount)}</td>
                    <td className="p-2 align-top">{v.hiddenSubscriberCount ? "非公開" : numberFormat(v.subscriberCount)}</td>
                    <td className="p-2 align-top">{v.likeCount !== undefined ? numberFormat(v.likeCount) : "-"}</td>
                    <td className="p-2 align-top">{new Date(v.publishedAt).toLocaleDateString()}</td>
                    <td className="p-2 align-top">{v.country || "-"}</td>
                    <td className="p-2 align-top">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchAllComments(v.videoId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                          style={{ backgroundColor: COLORS.accent }}
                          disabled={commentsLoadingFor === v.videoId}
                        >
                          {commentsLoadingFor === v.videoId ? <Loader2 className="w-4 h-4 animate-spin"/> : <MessageSquare className="w-4 h-4"/>}
                          コメント取得
                        </button>
                        <button
                          onClick={() => exportCommentsCSV(v.videoId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-50"
                          style={{ borderColor: COLORS.line }}
                          disabled={!commentsByVideo[v.videoId]?.length}
                        >
                          <Download className="w-4 h-4"/>
                          CSV
                        </button>
                      </div>
                      {commentsByVideo[v.videoId]?.length ? (
                        <p className="mt-1 text-xs text-neutral-500">{commentsByVideo[v.videoId].length}件のコメントを取得済み</p>
                      ) : null}
                    </td>
                  </tr>
                  {commentsByVideo[v.videoId]?.length ? (
                    <tr>
                      <td colSpan={10} className="p-0 border-t" style={{ borderColor: COLORS.line }}>
                        <div className="max-h-80 overflow-auto p-3 bg-neutral-50">
                          {commentsByVideo[v.videoId].map((c) => (
                            <div key={c.commentId} className="mb-3 border-b pb-2" style={{ borderColor: COLORS.line }}>
                              <div className="text-xs text-neutral-600 flex items-center justify-between">
                                <span>{c.authorDisplayName}</span>
                                <span>{new Date(c.publishedAt).toLocaleString()}</span>
                              </div>
                              <div className="mt-1 text-sm whitespace-pre-wrap">{c.textOriginal}</div>
                              <div className="mt-1 text-xs text-neutral-500">👍 {numberFormat(c.likeCount)} / ID: {c.commentId}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} YouTube運用支援ツール（MVP）
        {testReport.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer">Diagnostics</summary>
            <ul className="mt-1 text-left inline-block">
              {testReport.map((t, i) => (
                <li key={i} className="mt-0.5">{t}</li>
              ))}
            </ul>
          </details>
        )}
      </footer>
    </div>
  );
}
