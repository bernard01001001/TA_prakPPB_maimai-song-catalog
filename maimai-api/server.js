const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5050;
const CLOUDFRONT_MAIMAI_URL = 'https://dp4p6x0xfi5o9.cloudfront.net/maimai/data.json';
const JACKET_BASE_URL = 'https://dp4p6x0xfi5o9.cloudfront.net/maimai/jacket';
const CACHE_TTL_MS = 15 * 60 * 1000;

app.use(cors());
app.use(express.json());

let catalogState = {
  songs: [],
  source: 'uninitialized',
  lastUpdated: null,
};

function normalizeDifficulty(rawDiff) {
  const compact = String(rawDiff ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s:_-]+/g, '');

  if (compact === 'remaster' || compact.includes('remaster')) {
    return 'Re:MASTER';
  }
  if (compact === 'master') return 'MASTER';
  if (compact === 'expert') return 'EXPERT';
  if (compact === 'advanced') return 'ADVANCED';
  if (compact === 'basic') return 'BASIC';

  return String(rawDiff ?? 'MASTER').trim();
}

function normalizeSheet(sheet) {
  return {
    type: String(sheet?.type || 'DX'),
    difficulty: normalizeDifficulty(sheet?.difficulty),
    level: String(sheet?.level ?? '?'),
    internalLevel:
      sheet?.internalLevel !== undefined && sheet?.internalLevel !== null
        ? String(sheet.internalLevel)
        : null,
  };
}

function buildJacketUrl(rawImageName) {
  if (!rawImageName || typeof rawImageName !== 'string') return null;
  const trimmed = rawImageName.trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const fileName = /\.(png|jpe?g|webp)$/i.test(trimmed)
    ? trimmed
    : `${trimmed}.png`;
  return `${JACKET_BASE_URL}/${fileName}`;
}

function normalizeSong(raw, index) {
  const title =
    raw?.title ||
    raw?.name?.en ||
    raw?.name?.jp ||
    `Track ${index + 1}`;

  const artist =
    raw?.artist?.en ||
    raw?.artist?.jp ||
    (typeof raw?.artist === 'string' ? raw.artist : 'Unknown Artist');

  const rawSheets = Array.isArray(raw?.sheets) ? raw.sheets : [];
  const sheets = rawSheets.map(normalizeSheet);

  const firstVersion =
    raw?.version ||
    rawSheets.find((s) => s?.version)?.version ||
    'maimai DX';

  const rawImageName = raw?.imageName || raw?.image || raw?.cover || null;
  const imageName = rawImageName ? String(rawImageName).trim() : null;

  return {
    id: String(raw?.id ?? raw?.songId ?? `${index}-${title}`),
    title: String(title),
    artist: String(artist),
    category: String(raw?.category || 'maimai'),
    version: String(firstVersion),
    bpm: raw?.bpm ?? null,
    imageName,
    imageUrl: buildJacketUrl(imageName),
    sheets,
  };
}

async function refreshCatalog(force = false) {
  const now = Date.now();
  if (
    !force &&
    catalogState.lastUpdated &&
    now - catalogState.lastUpdated < CACHE_TTL_MS &&
    catalogState.songs.length > 0
  ) {
    return catalogState;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(CLOUDFRONT_MAIMAI_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`CloudFront HTTP ${response.status}`);
    }

    const payload = await response.json();
    const rawList = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.songs)
      ? payload.songs
      : [];

    if (rawList.length === 0) {
      throw new Error('CloudFront returned an empty song list');
    }

    catalogState = {
      songs: rawList.map(normalizeSong),
      source: 'cloudfront (dp4p6x0xfi5o9.cloudfront.net/maimai/data.json)',
      lastUpdated: now,
    };

    console.log(`Loaded ${catalogState.songs.length} maimai songs from CloudFront`);
    return catalogState;
  } catch (err) {
    console.error('Failed to fetch CloudFront maimai data:', err.message);
    return catalogState;
  }
}

app.post('/api/refresh', async (_req, res) => {
  const state = await refreshCatalog(true);
  return res.json({
    status: 'refreshed',
    source: state.source,
    totalSongs: state.songs.length,
  });
});

app.get('/api/health', (_req, res) => {
  const songsList = Array.isArray(catalogState?.songs) ? catalogState.songs : [];
  return res.json({
    status: 'ok',
    service: 'maimai-custom-web-service',
    source: catalogState?.source || 'unknown',
    totalSongs: songsList.length,
  });
});

app.get('/api/songs', async (req, res) => {
  try {
    await refreshCatalog(false);

    const { q = '', difficulty = 'ALL', version = '' } = req.query;
    const queryLower = String(q).trim().toLowerCase();
    const diffNormalized = normalizeDifficulty(difficulty).toUpperCase();
    const versionLower = String(version).trim().toLowerCase();

    const songsList = Array.isArray(catalogState?.songs) ? catalogState.songs : [];

    const filtered = songsList.filter((song) => {
      if (!song || typeof song !== 'object') return false;

      const title = String(song.title ?? '').toLowerCase();
      const artist = String(song.artist ?? '').toLowerCase();
      const category = String(song.category ?? '').toLowerCase();
      const songVersion = String(song.version ?? '').toLowerCase();
      const sheets = Array.isArray(song.sheets) ? song.sheets : [];

      const matchQuery =
        !queryLower ||
        title.includes(queryLower) ||
        artist.includes(queryLower) ||
        category.includes(queryLower) ||
        songVersion.includes(queryLower);

      const matchDiff =
        !difficulty ||
        String(difficulty).trim().toUpperCase() === 'ALL' ||
        sheets.some(
          (sheet) =>
            sheet &&
            normalizeDifficulty(sheet.difficulty).toUpperCase() === diffNormalized
        );

      const matchVersion = !versionLower || songVersion === versionLower;

      return matchQuery && matchDiff && matchVersion;
    });

    return res.json({
      source: catalogState?.source || 'cloudfront',
      total: filtered.length,
      songs: filtered,
    });
  } catch (err) {
    console.error('Error in GET /api/songs:', err);
    return res.status(500).json({
      message: 'Failed to filter songs',
      error: err.message,
    });
  }
});

app.get('/api/songs/:id', async (req, res) => {
  try {
    await refreshCatalog(false);
    const songsList = Array.isArray(catalogState?.songs) ? catalogState.songs : [];
    const song = songsList.find(
      (item) => String(item.id) === String(req.params.id)
    );

    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    return res.json({
      source: catalogState?.source || 'cloudfront',
      song,
    });
  } catch (err) {
    console.error('Error in GET /api/songs/:id:', err);
    return res.status(500).json({ message: 'Failed to load song detail' });
  }
});

app.get('/api/versions', async (_req, res) => {
  try {
    await refreshCatalog(false);
    const songsList = Array.isArray(catalogState?.songs) ? catalogState.songs : [];
    const versionMap = new Map();

    for (const song of songsList) {
      const versionName = song.version || 'maimai DX';
      const sheets = Array.isArray(song.sheets) ? song.sheets : [];
      const current = versionMap.get(versionName) || {
        id: encodeURIComponent(versionName),
        version: versionName,
        category: song.category || 'maimai',
        songCount: 0,
        chartCount: 0,
      };

      current.songCount += 1;
      current.chartCount += sheets.length;
      versionMap.set(versionName, current);
    }

    return res.json({
      source: catalogState?.source || 'cloudfront',
      versions: Array.from(versionMap.values()),
    });
  } catch (err) {
    console.error('Error in GET /api/versions:', err);
    return res.status(500).json({ message: 'Failed to load versions' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  return res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Custom maimai API running on http://0.0.0.0:${PORT}`);
  await refreshCatalog(true);
});