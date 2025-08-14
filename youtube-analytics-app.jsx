const { useEffect, useMemo, useState, useRef } = React;

// --- レスポンシブ判定フック ---
const useIsMobile = () => {
  // 初期値を実際の画面幅に基づいて設定
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

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

// --- Lucideアイコンコンポーネント ---
const Icon = ({ name, size = 20, className = "" }) => {
  const ref = useRef(null);
  
  useEffect(() => {
    if (ref.current && window.lucide) {
      const iconElement = window.lucide.createElement(window.lucide[name]);
      if (iconElement) {
        ref.current.innerHTML = '';
        iconElement.setAttribute('width', size);
        iconElement.setAttribute('height', size);
        iconElement.setAttribute('stroke-width', '2');
        ref.current.appendChild(iconElement);
      }
    }
  }, [name, size]);
  
  return <span ref={ref} className={`inline-flex ${className}`} />;
};

// --- 型定義（JSDocコメントとして） ---
/**
 * @typedef {Object} VideoRow
 * @property {string} videoId
 * @property {string} title
 * @property {string} channelId
 * @property {string} channelTitle
 * @property {string} publishedAt
 * @property {number} viewCount
 * @property {number} [likeCount]
 * @property {string} thumbnailUrl
 * @property {string} videoUrl
 * @property {string} channelUrl
 * @property {number} [subscriberCount]
 * @property {boolean} [hiddenSubscriberCount]
 * @property {string} [country]
 * @property {"3x" | "2x" | "1x" | "minViews" | "none"} matchedRule
 * @property {boolean} [isShort]
 */

/**
 * @typedef {Object} CommentRow
 * @property {string} videoId
 * @property {string} commentId
 * @property {string} [parentId]
 * @property {string} authorDisplayName
 * @property {string} textOriginal
 * @property {number} likeCount
 * @property {string} publishedAt
 * @property {string} [updatedAt]
 */

const COUNTRY_OPTIONS = [
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


 // 既定 exclude
 // 登録者比のしきい値

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
function durationToSeconds(iso) {
  if (!iso) return undefined;
  const m = iso.match(/^PT((\d+)H)?((\d+)M)?((\d+)S)?$/);
  if (!m) return undefined;
  const h = Number(m[2] || 0);
  const mi = Number(m[4] || 0);
  const s = Number(m[6] || 0);
  return h * 3600 + mi * 60 + s;
}

// 日本語形式の数値表示（万単位）
function numberFormat(n) {
  if (n === undefined || n === null) return "-";
  const num = Number(n);
  if (num >= 10000) {
    const wan = num / 10000;
    // 小数点第2位まで表示
    return `${wan.toFixed(2)}万`;
  }
  return n.toLocaleString();
}

// 日本語形式の日付表示（年月日）
function dateFormatJapanese(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// CSV生成（テスト可能な純関数）
function buildCSV(headers, rows, selector) {
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

async function testApiKey(key) {
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

// Shorts 判定の強化（2分以内 もしくは ショートタグ）
function isShortByHeuristic(v) {
  const durationSec = durationToSeconds(v?.contentDetails?.duration);
  const shortByTime = typeof durationSec === "number" && durationSec <= 120; // 2分以内
  const title = v?.snippet?.title || "";
  const description = v?.snippet?.description || "";
  const tags = Array.isArray(v?.snippet?.tags) ? v.snippet.tags : [];
  
  // 日本語・英語両方のショートタグを検出
  const shortPatterns = [
    /#shorts/i,
    /#short/i,
    /ショート/,
    /ショーツ/,
    /shorts/i,
    /short動画/i
  ];
  
  const hasShortTag = shortPatterns.some(pattern => 
    pattern.test(title) || 
    pattern.test(description) || 
    tags.some(tag => pattern.test(tag))
  );
  
  return shortByTime || hasShortTag;
}

// 比率しきい値の判定（テストしやすい純関数）
function qualifiesByRatio(viewCount, subscriberCount, hidden, multiple) {
  if (hidden) return false;
  if (typeof subscriberCount !== "number") return false;
  return viewCount >= multiple * subscriberCount;
}

// --- メインコンポーネント ---
function App() {
  const isMobile = useIsMobile();
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
  
  // 読み込み状況の追跡
  const [loadingStats, setLoadingStats] = useState({
    totalFetched: 0,
    totalFiltered: 0,
    currentPage: 0,
    totalPages: 0
  });

  const [commentsLoadingFor, setCommentsLoadingFor] = useState(null);
  const [commentsByVideo, setCommentsByVideo] = useState({});
  const [selected, setSelected] = useState({});
  const [testReport, setTestReport] = useState([]); // 簡易テストレポート
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false); // 診断情報の表示/非表示
  
  // モバイル用の状態
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  
  // ソート機能の状態管理
  const [sortConfig, setSortConfig] = useState({
    key: 'viewCount',
    direction: 'desc'
  });
  
  // サムネイル拡大表示の状態管理
  const [expandedThumbnail, setExpandedThumbnail] = useState(null);

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
  
  // ソート機能の実装
  const handleSort = (key) => {
    setSortConfig((prev) => {
      // 同じキーをクリックした場合は方向を切り替え
      if (prev.key === key) {
        if (prev.direction === 'desc') {
          return { key, direction: 'asc' };
        } else if (prev.direction === 'asc') {
          // 3回目のクリックでデフォルトに戻る
          return { key: 'viewCount', direction: 'desc' };
        }
      }
      // 新しいキーの場合は降順から開始
      return { key, direction: 'desc' };
    });
  };
  
  // ソート済み動画リストの生成
  const sortedVideos = useMemo(() => {
    if (!videos.length) return videos;
    
    const sorted = [...videos].sort((a, b) => {
      const { key, direction } = sortConfig;
      let aVal = a[key];
      let bVal = b[key];
      
      // null/undefined の処理
      if (aVal === null || aVal === undefined) aVal = -Infinity;
      if (bVal === null || bVal === undefined) bVal = -Infinity;
      
      // 日付の場合は Date オブジェクトに変換
      if (key === 'publishedAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      // 数値比較
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [videos, sortConfig]);

  async function runSearch() {
    setLoading(true);
    setError("");
    setVideos([]);
    setSelected({});
    setLoadingStats({
      totalFetched: 0,
      totalFiltered: 0,
      currentPage: 0,
      totalPages: 0
    });
    try {
      const q = query.trim() || "薄毛 対策 シャンプー"; // 空でもデフォ入力相当
      if (!apiKey) throw new Error("APIキーを入力してください。");

      // 500件（最大10ページ）取得するためのページネーション
      const allVideoIds = [];
      let nextPageToken = null;
      let pageCount = 0;
      const maxPages = 10; // 最大10ページ（500件）
      
      setLoadingStats(prev => ({ ...prev, totalPages: maxPages }));
      
      do {
        // search.list
        const searchParams = new URLSearchParams({
          key: apiKey,
          part: "snippet",
          type: "video",
          maxResults: "50", // 1ページあたり50件
          q,
          publishedAfter,
          order: "relevance",
        });
        if (country) {
          searchParams.set("regionCode", country.toUpperCase());
        }
        if (nextPageToken) {
          searchParams.set("pageToken", nextPageToken);
        }
        
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
        const sres = await fetch(searchUrl);
        if (!sres.ok) {
          const body = await sres.json().catch(() => ({}));
          throw new Error(body?.error?.message || `search.list HTTP ${sres.status}`);
        }
        const sjson = await sres.json();
        const items = sjson.items || [];
        const videoIds = items.map((it) => it?.id?.videoId).filter(Boolean);
        allVideoIds.push(...videoIds);
        
        nextPageToken = sjson.nextPageToken;
        pageCount++;
        
        setLoadingStats(prev => ({ 
          ...prev, 
          currentPage: pageCount,
          totalFetched: allVideoIds.length 
        }));
        
      } while (nextPageToken && pageCount < maxPages);
      
      if (allVideoIds.length === 0) {
        setVideos([]);
        setLoading(false);
        return;
      }

      // 50件ずつバッチ処理して動画詳細を取得
      const allVideos = [];
      const allChannelIds = new Set();
      
      for (let i = 0; i < allVideoIds.length; i += 50) {
        const batchIds = allVideoIds.slice(i, i + 50);
        
        // videos.list（Shorts判定強化のため、snippet.description/tagsも利用）
        const vparams = new URLSearchParams({
          key: apiKey,
          part: "snippet,statistics,contentDetails",
          id: batchIds.join(","),
          maxResults: String(batchIds.length),
        });
        const vurl = `https://www.googleapis.com/youtube/v3/videos?${vparams.toString()}`;
        const vres = await fetch(vurl);
        if (!vres.ok) {
          const body = await vres.json().catch(() => ({}));
          throw new Error(body?.error?.message || `videos.list HTTP ${vres.status}`);
        }
        const vjson = await vres.json();
        allVideos.push(...(vjson.items || []));
        
        // チャンネルIDを収集
        (vjson.items || []).forEach(v => {
          if (v?.snippet?.channelId) {
            allChannelIds.add(v.snippet.channelId);
          }
        });
      }
      
      // チャンネル情報を50件ずつバッチ処理
      const channelMap = {};
      const channelIdsArray = Array.from(allChannelIds);
      
      for (let i = 0; i < channelIdsArray.length; i += 50) {
        const batchChannelIds = channelIdsArray.slice(i, i + 50);
        
        // channels.list
        const cparams = new URLSearchParams({
          key: apiKey,
          part: "snippet,statistics",
          id: batchChannelIds.join(","),
          maxResults: String(batchChannelIds.length),
        });
        const curl = `https://www.googleapis.com/youtube/v3/channels?${cparams.toString()}`;
        const cres = await fetch(curl);
        if (!cres.ok) {
          const body = await cres.json().catch(() => ({}));
          throw new Error(body?.error?.message || `channels.list HTTP ${cres.status}`);
        }
        const cjson = await cres.json();
        for (const c of cjson.items || []) {
          channelMap[c.id] = c;
        }
      }

      const minViewsNum = Number(minViews || 0);

      const rows = allVideos
        .map((v) => {
          const ch = channelMap[v?.snippet?.channelId];
          const subCount = ch?.statistics?.subscriberCount ? Number(ch.statistics.subscriberCount) : undefined;
          const hidden = Boolean(ch?.statistics?.hiddenSubscriberCount);
          const countryCode = ch?.snippet?.country || undefined;
          const vc = v?.statistics?.viewCount ? Number(v.statistics.viewCount) : 0;
          const lc = v?.statistics?.likeCount ? Number(v.statistics.likeCount) : undefined;
          const qualifiesRatio = qualifiesByRatio(vc, subCount, hidden, ratioThreshold);
          const qualifiesByMin = vc >= minViewsNum;
          const matchedRule = qualifiesRatio
            ? `${ratioThreshold}x`
            : qualifiesByMin
            ? "minViews"
            : "none";
          const isShort = isShortByHeuristic(v); // 強化版判定
          // 拡散率の計算を追加
          const spreadRate = (subCount && !hidden && subCount > 0) 
            ? (vc / subCount) 
            : null;
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
            spreadRate, // 拡散率を追加
          };
        })
        .filter((r) => {
          const countryOk = country ? r.country?.toUpperCase() === country.toUpperCase() : true;
          const viewsOk = r.viewCount >= Number(minViews || 0);
          const shortsOk = shortsMode === "include" ? true : shortsMode === "only" ? !!r.isShort : !r.isShort;
          
          // 重要な変更: AND条件に変更
          // includeHidden=false → 再生数AND登録者数比率の両方を満たす
          // includeHidden=true → 最低再生数のみで判定（登録者数非公開も含める）
          if (includeHidden) {
            // 登録者数非公開チャンネルも含める場合は最低再生数のみで判定
            return countryOk && shortsOk && viewsOk;
          } else {
            // 通常時: 再生数 AND 登録者数比率の両方を満たす必要がある
            const ratioOk = qualifiesByRatio(r.viewCount, r.subscriberCount, r.hiddenSubscriberCount, ratioThreshold);
            return countryOk && shortsOk && viewsOk && ratioOk;
          }
        })
        .sort((a, b) => b.viewCount - a.viewCount);

      setLoadingStats(prev => ({ 
        ...prev, 
        totalFiltered: rows.length
      }));
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
      "spreadRate",
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
          case "spreadRate":
            return r.spreadRate !== null ? r.spreadRate.toFixed(2) : "";
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
      (r, key) => r[key]
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
      (r, key) => r[key]
    );
  }

  // --- 簡易セルフテスト（起動時に一度実行） ---
  function runSelfTests() {
    const logs = [];
    try {
      // buildCSV の改行とエスケープ
      const h = ["a", "b"]; const rows = [{ a: '1,2', b: '"q"' }];
      const csv = buildCSV(h, rows, (r, k) => r[k]);
      if (!csv.includes('\n')) throw new Error('CSV に改行が含まれません');
      if (!csv.includes('"1,2"')) throw new Error('カンマのエスケープに失敗');
      if (!csv.includes('""q""')) throw new Error('ダブルクォートのエスケープに失敗');
      logs.push('CSV 生成: OK');

      // durationToSeconds と Shorts 判定（強化版）
      const d45 = durationToSeconds('PT45S');
      const d120 = durationToSeconds('PT2M');
      const d121 = durationToSeconds('PT2M1S');
      if (d45 !== 45 || d120 !== 120 || d121 !== 121) throw new Error('duration 変換に失敗');
      
      // 2分以内はショート
      const mockV1 = { snippet: { title: 'test', description: '', tags: [] }, contentDetails: { duration: 'PT1M30S' } };
      // タグ付きもショート
      const mockV2 = { snippet: { title: 'test #Shorts', description: '', tags: [] }, contentDetails: { duration: 'PT3M' } };
      // 日本語タグもショート
      const mockV3 = { snippet: { title: 'ショート動画', description: '', tags: [] }, contentDetails: { duration: 'PT3M' } };
      // 2分超えでタグなしは通常動画
      const mockV4 = { snippet: { title: 'test', description: 'no tag', tags: [] }, contentDetails: { duration: 'PT2M1S' } };
      
      if (!(isShortByHeuristic(mockV1) && isShortByHeuristic(mockV2) && isShortByHeuristic(mockV3) && !isShortByHeuristic(mockV4))) {
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

  // サムネイル拡大モーダルコンポーネント
  const ThumbnailModal = ({ video, onClose }) => {
    // ESCキーで閉じる
    useEffect(() => {
      const handleEsc = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);
    
    if (!video) return null;
    
    // 高解像度サムネイルURL生成
    const getHighResThumbnail = () => {
      const videoId = video.videoId;
      // maxresdefault が存在しない場合もあるため、複数の解像度を試す
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    };
    
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
        onClick={onClose}
      >
        <div 
          className="relative max-w-4xl max-h-[90vh] mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-lg hover:bg-gray-100"
          >
            <span className="text-xl">&times;</span>
          </button>
          <img 
            src={getHighResThumbnail()} 
            alt={video.title}
            className="max-w-full max-h-[85vh] rounded-lg shadow-xl"
            onError={(e) => {
              // maxresdefault が無い場合は通常のサムネイルにフォールバック
              e.target.src = video.thumbnailUrl;
            }}
          />
          <div className="mt-2 p-2 bg-white rounded-lg shadow-lg">
            <p className="text-sm font-medium text-gray-800 line-clamp-2">{video.title}</p>
            <p className="text-xs text-gray-600 mt-1">{video.channelTitle}</p>
          </div>
        </div>
      </div>
    );
  };

  // モバイル用動画カードコンポーネント
  const MobileVideoCard = ({ video, selected, onSelectChange, onFetchComments, commentsLoading, comments }) => (
    <div className="bg-white rounded-lg shadow-sm border mb-4" style={{ borderColor: COLORS.line }}>
      {/* サムネイル */}
      <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" className="block">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <img 
            src={video.thumbnailUrl} 
            alt={video.title} 
            className="absolute inset-0 w-full h-full object-cover rounded-t-lg"
            loading="lazy"
          />
          {video.isShort && (
            <span className="absolute top-2 left-2 text-xs text-white px-2 py-1 rounded bg-black bg-opacity-70">
              Shorts
            </span>
          )}
        </div>
      </a>
      
      {/* コンテンツ */}
      <div className="p-4">
        {/* タイトル */}
        <h3 className="font-semibold text-base mb-2 line-clamp-2">{video.title}</h3>
        
        {/* チャンネル */}
        <a 
          href={video.channelUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-sm text-neutral-600 hover:underline block mb-3"
        >
          {video.channelTitle}
        </a>
        
        {/* 統計情報 */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">再生:</span>
            <span className="font-medium">{numberFormat(video.viewCount)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">登録:</span>
            <span className="font-medium">
              {video.hiddenSubscriberCount ? "非公開" : numberFormat(video.subscriberCount)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">拡散率:</span>
            <span className="font-medium">
              {video.spreadRate !== null ? (
                <span style={{ 
                  color: video.spreadRate < 1 ? '#ef4444' : video.spreadRate >= 3 ? '#10b981' : '#0F0F0F' 
                }}>
                  {video.spreadRate.toFixed(2)}倍
                </span>
              ) : '-'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">高評価:</span>
            <span className="font-medium">
              {video.likeCount !== undefined ? numberFormat(video.likeCount) : "-"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">公開:</span>
            <span className="font-medium">
              {dateFormatJapanese(video.publishedAt)}
            </span>
          </div>
        </div>
        
        {/* アクション */}
        <div className="flex gap-2">
          <button
            onClick={() => onSelectChange(!selected)}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              selected 
                ? 'bg-blue-500 text-white' 
                : 'bg-neutral-100 text-neutral-700'
            }`}
            style={{ minHeight: '44px' }}
          >
            {selected ? '選択済み' : '選択'}
          </button>
          <button
            onClick={onFetchComments}
            className="flex-1 py-3 px-4 rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: "#2B2B2B", minHeight: '44px' }}
            disabled={commentsLoading}
          >
            {commentsLoading ? "読込中..." : "コメント"}
          </button>
        </div>
        
        {/* コメント数表示 */}
        {comments?.length > 0 && (
          <div className="mt-2 text-sm text-neutral-500 text-center">
            {comments.length}件のコメント取得済み
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg, color: COLORS.text }}>
      {/* サムネイル拡大モーダル */}
      {expandedThumbnail && (
        <ThumbnailModal 
          video={expandedThumbnail} 
          onClose={() => setExpandedThumbnail(null)}
        />
      )}
      
      {/* レスポンシブヘッダー */}
      <header className="sticky top-0 z-10 border-b bg-white" style={{ borderColor: COLORS.line }}>
        {isMobile ? (
          // モバイルヘッダー
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-sm" style={{ backgroundColor: COLORS.accent }} />
                <h1 className="text-lg font-semibold">YouTube分析</h1>
              </div>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg hover:bg-neutral-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
            </div>
            
            {/* APIキー入力（展開時） */}
            {mobileMenuOpen && (
              <div className="border-t pt-3 mt-3" style={{ borderColor: COLORS.line }}>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                  style={{ borderColor: COLORS.line }}
                  type="password"
                  placeholder="APIキーを入力"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button
                  onClick={onSaveKey}
                  className="w-full py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: COLORS.accent }}
                >
                  {verifying ? "確認中..." : "保存"}
                </button>
                {keyVerified && (
                  <div className="text-center text-sm text-green-600 mt-2">APIキー有効</div>
                )}
                {verifyError && (
                  <div className="text-center text-sm text-red-600 mt-2">{verifyError}</div>
                )}
              </div>
            )}
          </div>
        ) : (
          // デスクトップヘッダー（既存）
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
              {verifying ? "..." : "保存"}
            </button>
            {keyVerified ? (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">有効</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-neutral-500">未設定</span>
            )}
          </div>
        </div>
        )}
        {verifyError && (
          <div className="mx-auto max-w-6xl px-4 pb-2 text-sm text-red-600">{verifyError}</div>
        )}
      </header>

      {/* 検索カード */}
      <section className={isMobile ? "px-4 py-4" : "mx-auto max-w-6xl px-4 py-6"}>
        {isMobile ? (
          // モバイル用検索UI
          <div className="bg-white rounded-lg border p-4 mb-4" style={{ borderColor: COLORS.line }}>
            <h2 className="text-base font-semibold mb-4">検索条件</h2>
            
            {/* 常に表示する主要項目 */}
            <div className="space-y-3">
              {/* キーワード */}
              <div>
                <label className="block text-sm font-medium mb-1">キーワード</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  style={{ borderColor: COLORS.line, minHeight: '44px' }}
                  placeholder="例: 薄毛 対策"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              
              {/* 最低再生数 */}
              <div>
                <label className="block text-sm font-medium mb-1">最低再生数</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  style={{ borderColor: COLORS.line, minHeight: '44px' }}
                  type="number"
                  placeholder="10000"
                  value={minViews}
                  onChange={(e) => setMinViews(e.target.value)}
                />
              </div>
                
                {/* その他の設定 */}
                <details className="border-t pt-3" style={{ borderColor: COLORS.line }}>
                  <summary className="text-sm font-medium cursor-pointer">詳細設定</summary>
                  <div className="mt-3 space-y-3">
                    {/* 国指定 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">国</label>
                      <select
                        className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white"
                        style={{ borderColor: COLORS.line, minHeight: '44px' }}
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      >
                        {COUNTRY_OPTIONS.map(opt => (
                          <option key={opt.code} value={opt.code}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* 期間 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">期間</label>
                      <select
                        className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white"
                        style={{ borderColor: COLORS.line, minHeight: '44px' }}
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        <option value="3y">3年以内</option>
                        <option value="2y">2年以内</option>
                        <option value="1y">1年以内</option>
                        <option value="6m">半年以内</option>
                      </select>
                    </div>
                    
                    {/* ショート */}
                    <div>
                      <label className="block text-sm font-medium mb-1">ショート</label>
                      <select
                        className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white"
                        style={{ borderColor: COLORS.line, minHeight: '44px' }}
                        value={shortsMode}
                        onChange={(e) => setShortsMode(e.target.value)}
                      >
                        <option value="exclude">除外</option>
                        <option value="include">含める</option>
                        <option value="only">のみ</option>
                      </select>
                    </div>
                    
                    {/* 比率 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">登録者比</label>
                      <select
                        className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white"
                        style={{ borderColor: COLORS.line, minHeight: '44px' }}
                        value={ratioThreshold}
                        onChange={(e) => setRatioThreshold(Number(e.target.value))}
                      >
                        <option value={3}>3倍以上</option>
                        <option value={2}>2倍以上</option>
                        <option value={1}>1倍以上</option>
                      </select>
                    </div>
                  </div>
                </details>
                
                {/* 検索ボタン */}
                <button
                  onClick={runSearch}
                  className="w-full py-3 rounded-lg text-white font-medium"
                  style={{ backgroundColor: COLORS.accent, minHeight: '44px' }}
                  disabled={loading}
                >
                  {loading ? "検索中..." : "検索"}
                </button>
              </div>
          </div>
        ) : (
          // デスクトップ用検索UI（既存）
          <div className="border rounded-xl p-4" style={{ borderColor: COLORS.line }}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-semibold">検索条件</h2>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">キーワード</label>
              <input
                className="w-full border rounded-lg px-3 py-2 focus:outline-none"
                style={{ borderColor: COLORS.line }}
                placeholder="例: 薄毛 対策 シャンプー"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">最低再生数（既定 10000）</label>
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
              <label className="block text-sm font-medium mb-1">国指定</label>
              <div className="relative">
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
              <label className="block text-sm font-medium mb-1">対象期間</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
                style={{ borderColor: COLORS.line }}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="3y">直近3年（既定）</option>
                <option value="2y">直近2年</option>
                <option value="1y">直近1年</option>
                <option value="6m">直近半年</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">取得件数</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
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
              <label className="block text-sm font-medium mb-1">ショートの扱い</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
                style={{ borderColor: COLORS.line }}
                value={shortsMode}
                onChange={(e) => setShortsMode(e.target.value)}
              >
                <option value="exclude">ショートを含めない（既定）</option>
                <option value="include">ショートを含める</option>
                <option value="only">ショートのみ</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">登録者比しきい値</label>
              <select
                className="w-full border rounded-lg px-3 py-2 focus:outline-none bg-white"
                style={{ borderColor: COLORS.line }}
                value={ratioThreshold}
                onChange={(e) => setRatioThreshold(Number(e.target.value))}
              >
                <option value={3}>3倍以上（既定）</option>
                <option value={2}>2倍以上</option>
                <option value={1}>1倍以上</option>
              </select>
            </div>
            <div className="lg:col-span-3">
              <label className="flex items-center text-sm">
                <input type="checkbox" className="mr-2" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)}/>
                登録者数非公開チャンネルも含める（この場合は最低再生数のみで判定）
              </label>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={runSearch}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: COLORS.accent }}
              disabled={loading}
            >
              {loading ? "検索中..." : "検索"}
            </button>
            <button
              onClick={exportVideosCSV}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border"
              style={{ borderColor: COLORS.line }}
              disabled={!videos.length}
            >
              ↓ 一覧CSV出力
            </button>
            <button
              onClick={exportSelectedCommentsCSV}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border"
              style={{ borderColor: COLORS.line }}
              disabled={!Object.values(selected).some(Boolean)}
            >
              ↓ 選択コメントCSV出力
            </button>
            <span className="text-sm text-neutral-500">対象期間は {new Date(publishedAfter).toLocaleDateString()} 以降</span>
          </div>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </div>
        )}
      </section>

      {/* 結果一覧 */}
      <section className="mx-auto max-w-6xl px-4 pb-8">
        {/* 読み込み状況の表示 */}
        {(loading || videos.length > 0) && (
          <div className="mb-4 p-3 bg-neutral-50 rounded-lg border" style={{ borderColor: COLORS.line }}>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                {loading ? (
                  <span>検索中: {loadingStats.currentPage}/{loadingStats.totalPages}ページ処理済み ({loadingStats.totalFetched}件取得)</span>
                ) : (
                  <span>検索結果: {loadingStats.totalFetched}件取得 → {loadingStats.totalFiltered}件表示</span>
                )}
              </div>
              {!loading && videos.length > 0 && !isMobile && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allSelected = videos.every(v => selected[v.videoId]);
                      const newSelected = {};
                      videos.forEach(v => {
                        newSelected[v.videoId] = !allSelected;
                      });
                      setSelected(newSelected);
                    }}
                    className="px-3 py-1 text-sm rounded-lg border"
                    style={{ borderColor: COLORS.line }}
                  >
                    {videos.every(v => selected[v.videoId]) ? "全件選択解除" : "全件選択"}
                  </button>
                  <span className="text-sm text-neutral-500">
                    {Object.values(selected).filter(Boolean).length}件選択中
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* モバイル用ソートセレクター */}
        {isMobile && videos.length > 0 && !loading && (
          <div className="mb-4 flex items-center gap-2">
            <label className="text-sm font-medium">並び替え:</label>
            <select
              className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
              style={{ borderColor: COLORS.line }}
              value={`${sortConfig.key}-${sortConfig.direction}`}
              onChange={(e) => {
                const [key, direction] = e.target.value.split('-');
                setSortConfig({ key, direction });
              }}
            >
              <option value="viewCount-desc">再生数 (高い順)</option>
              <option value="viewCount-asc">再生数 (低い順)</option>
              <option value="subscriberCount-desc">登録者数 (多い順)</option>
              <option value="subscriberCount-asc">登録者数 (少ない順)</option>
              <option value="spreadRate-desc">拡散率 (高い順)</option>
              <option value="spreadRate-asc">拡散率 (低い順)</option>
              <option value="likeCount-desc">高評価 (多い順)</option>
              <option value="likeCount-asc">高評価 (少ない順)</option>
              <option value="publishedAt-desc">公開日 (新しい順)</option>
              <option value="publishedAt-asc">公開日 (古い順)</option>
            </select>
          </div>
        )}
        {isMobile ? (
          // モバイル用カードレイアウト
          <div className="space-y-3">
            {loading && (
              <div className="py-8 text-center text-neutral-500">読み込み中...</div>
            )}
            {!loading && videos.length === 0 && (
              <div className="py-8 text-center text-neutral-500">結果はありません。</div>
            )}
            {!loading && sortedVideos.map(v => (
              <MobileVideoCard 
                key={v.videoId}
                video={v}
                selected={selected[v.videoId]}
                onSelectChange={(checked) => setSelected(prev => ({ ...prev, [v.videoId]: checked }))}
                comments={commentsByVideo[v.videoId]}
                commentsLoading={commentsLoadingFor === v.videoId}
                onFetchComments={() => fetchAllComments(v.videoId)}
              />
            ))}
          </div>
        ) : (
          // デスクトップ用テーブルレイアウト
          <div className="border rounded-xl overflow-hidden" style={{ borderColor: COLORS.line }}>
            <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b" style={{ borderColor: COLORS.line }}>
              <tr>
                <th className="p-2 text-left font-medium"></th>
                <th className="p-2 text-left font-medium">サムネ</th>
                <th className="p-2 text-left font-medium">タイトル</th>
                <th className="p-2 text-left font-medium">チャンネル</th>
                <th 
                  className="p-2 text-right font-medium cursor-pointer hover:bg-neutral-100 transition-colors" 
                  style={{ minWidth: "100px" }}
                  onClick={() => handleSort('viewCount')}
                >
                  再生数
                  <span className="ml-1" style={{ 
                    color: sortConfig.key === 'viewCount' ? '#0F0F0F' : '#9CA3AF' 
                  }}>
                    {sortConfig.key === 'viewCount' && sortConfig.direction === 'asc' ? '▲' : '▼'}
                  </span>
                </th>
                <th 
                  className="p-2 text-right font-medium cursor-pointer hover:bg-neutral-100 transition-colors" 
                  style={{ minWidth: "100px" }}
                  onClick={() => handleSort('subscriberCount')}
                >
                  登録者数
                  <span className="ml-1" style={{ 
                    color: sortConfig.key === 'subscriberCount' ? '#0F0F0F' : '#9CA3AF' 
                  }}>
                    {sortConfig.key === 'subscriberCount' && sortConfig.direction === 'asc' ? '▲' : '▼'}
                  </span>
                </th>
                <th 
                  className="p-2 text-right font-medium cursor-pointer hover:bg-neutral-100 transition-colors" 
                  style={{ minWidth: "100px" }}
                  onClick={() => handleSort('spreadRate')}
                >
                  拡散率
                  <span className="ml-1" style={{ 
                    color: sortConfig.key === 'spreadRate' ? '#0F0F0F' : '#9CA3AF' 
                  }}>
                    {sortConfig.key === 'spreadRate' && sortConfig.direction === 'asc' ? '▲' : '▼'}
                  </span>
                </th>
                <th 
                  className="p-2 text-center font-medium cursor-pointer hover:bg-neutral-100 transition-colors" 
                  style={{ minWidth: "100px" }}
                  onClick={() => handleSort('likeCount')}
                >
                  高評価
                  <span className="ml-1" style={{ 
                    color: sortConfig.key === 'likeCount' ? '#0F0F0F' : '#9CA3AF' 
                  }}>
                    {sortConfig.key === 'likeCount' && sortConfig.direction === 'asc' ? '▲' : '▼'}
                  </span>
                </th>
                <th 
                  className="p-2 text-left font-medium cursor-pointer hover:bg-neutral-100 transition-colors"
                  onClick={() => handleSort('publishedAt')}
                >
                  公開日
                  <span className="ml-1" style={{ 
                    color: sortConfig.key === 'publishedAt' ? '#0F0F0F' : '#9CA3AF' 
                  }}>
                    {sortConfig.key === 'publishedAt' && sortConfig.direction === 'asc' ? '▲' : '▼'}
                  </span>
                </th>
                <th className="p-2 text-center font-medium">国</th>
                <th className="p-2 text-left font-medium" style={{ minWidth: "150px" }}>コメント取得</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="11" className="py-8 text-center text-neutral-500">読み込み中...</td></tr>
              )}
              {!loading && videos.length === 0 && (
                <tr><td colSpan="11" className="py-8 text-center text-neutral-500">結果はありません。</td></tr>
              )}
              {!loading && sortedVideos.map(v => (
                <React.Fragment key={v.videoId}>
                  <tr key={v.videoId} className="border-t hover:bg-neutral-50 transition-colors" style={{ borderColor: COLORS.line }}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!selected[v.videoId]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [v.videoId]: e.target.checked }))}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="p-2">
                      <div className="relative bg-neutral-200 rounded overflow-hidden" style={{ width: '120px', height: '68px' }}>
                        <img 
                          src={v.thumbnailUrl} 
                          alt={v.title} 
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setExpandedThumbnail(v)}
                        />
                        <a 
                          href={v.videoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="absolute bottom-1 right-1 bg-black bg-opacity-60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-opacity-80"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ▶
                        </a>
                      </div>
                    </td>
                    <td className="px-4 font-medium text-neutral-800">
                      {v.title}
                      {v.isShort ? <span className="ml-2 text-[10px] text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: COLORS.accent, color: '#fff' }}>Shorts</span> : null}
                    </td>
                    <td>
                      <a href={v.channelUrl} target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:underline">{v.channelTitle}</a>
                    </td>
                    <td className="text-right">{numberFormat(v.viewCount)}</td>
                    <td className="text-right">{v.hiddenSubscriberCount ? "非公開" : numberFormat(v.subscriberCount)}</td>
                    <td className="text-right">
                      {v.spreadRate !== null ? (
                        <span style={{ 
                          color: v.spreadRate < 1 ? '#ef4444' : v.spreadRate >= 3 ? '#10b981' : '#0F0F0F' 
                        }}>
                          {v.spreadRate.toFixed(2)}倍
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-center">{v.likeCount !== undefined ? numberFormat(v.likeCount) : "-"}</td>
                    <td>{dateFormatJapanese(v.publishedAt)}</td>
                    <td className="text-center">{v.country || "-"}</td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => fetchAllComments(v.videoId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                          style={{ backgroundColor: "#2B2B2B" }}
                          disabled={commentsLoadingFor === v.videoId}
                        >
                          {commentsLoadingFor === v.videoId ? "読込中..." : "取得"}
                        </button>
                        <button
                          onClick={() => exportCommentsCSV(v.videoId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-50"
                          style={{ borderColor: COLORS.line }}
                          disabled={!commentsByVideo[v.videoId]?.length}
                        >
                          ↓ CSV
                        </button>
                      </div>
                      {commentsByVideo[v.videoId]?.length ? (
                        <div className="text-xs text-neutral-500 mt-1">{commentsByVideo[v.videoId].length}件のコメントを取得済み</div>
                      ) : null}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="py-4 text-center text-sm text-neutral-500">
        © {new Date().getFullYear()} YouTube運用支援ツール（MVP）
        {testReport.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
              className="text-xs text-neutral-400 hover:text-neutral-500 transition-colors inline-flex items-center gap-1"
            >
              <span>Diagnostics</span>
              <svg 
                className={`w-3 h-3 transition-transform ${diagnosticsOpen ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {diagnosticsOpen && (
              <div className="mt-2 text-xs text-neutral-400 space-y-0.5">
                {testReport.map((t, i) => (
                  <div key={i}>{t}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

// Reactアプリケーションをレンダリング
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
