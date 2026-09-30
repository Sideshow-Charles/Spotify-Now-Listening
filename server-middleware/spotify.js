const axios = require('axios');
const https = require('https');


const httpsAgent = new https.Agent({
    rejectUnauthorized: process.env.NODE_ENV === 'production'
});


let cachedToken = null;
let tokenExpiryTime = null;

// Spotify's preview_url is deprecated (null), so previews come from Deezer (by ISRC)
// with an iTunes title/artist fallback. Cached per track id so the 5s poll
// doesn't hit upstream every time.
const previewCache = new Map();
const PREVIEW_HIT_TTL = 10 * 60 * 1000; // Deezer URLs are signed and expire
const PREVIEW_MISS_TTL = 60 * 60 * 1000;
const PREVIEW_CACHE_MAX = 200;


async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiryTime) {
        return cachedToken;
    }
    const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
        }),
        {
            httpsAgent,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(
                    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                ).toString('base64')}`,
            },
        }
    );
    cachedToken = response.data.access_token;
    tokenExpiryTime = Date.now() + response.data.expires_in * 1000;
    return cachedToken;
}


function normalizeText(s = '') {
    return s
        .toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g, '') // "(feat. X)", "[Remastered]"
        .replace(/\s-\s.*$/, '') // " - Radio Edit"
        .replace(/[^a-z0-9]/g, '');
}

async function previewFromDeezer(isrc) {
    if (!isrc) return null;
    try {
        const { data } = await axios.get(
            `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
            { httpsAgent, timeout: 3000 }
        );
        return data && !data.error && data.preview ? data.preview : null;
    } catch {
        return null;
    }
}

async function previewFromItunes(title, artist) {
    if (!title) return null;
    try {
        const { data } = await axios.get('https://itunes.apple.com/search', {
            httpsAgent,
            timeout: 3000,
            params: { term: `${artist} ${title}`.trim(), media: 'music', entity: 'song', limit: 15 },
        });
        const wantTitle = normalizeText(title);
        const wantArtist = normalizeText(artist);
        const hit = (data.results || []).find(
            (r) =>
                r.previewUrl &&
                normalizeText(r.trackName) === wantTitle &&
                (!wantArtist || normalizeText(r.artistName).includes(wantArtist))
        );
        return hit ? hit.previewUrl : null;
    } catch {
        return null;
    }
}

async function resolvePreview(item) {
    // Episodes have no ISRC and no clean preview source; local files have nothing to look up.
    if (!item || item.type !== 'track' || item.is_local) return null;
    if (item.preview_url) return item.preview_url; // in case Spotify ever returns one

    const cached = previewCache.get(item.id);
    if (cached && Date.now() < cached.expires) return cached.url;

    const isrc = item.external_ids?.isrc;
    const artist = item.artists?.[0]?.name || '';
    const url = (await previewFromDeezer(isrc)) || (await previewFromItunes(item.name, artist));

    if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.clear();
    previewCache.set(item.id, {
        url,
        expires: Date.now() + (url ? PREVIEW_HIT_TTL : PREVIEW_MISS_TTL),
    });
    return url;
}


module.exports = async function (req, res, next) {
    if (req.url === '/now-playing') {
        try {
            const accessToken = await getAccessToken();
            const nowPlaying = await axios.get(
                'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode',
                {
                    httpsAgent,
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );

            if (nowPlaying.data && nowPlaying.data.is_playing && nowPlaying.data.item) {
                const preview = await resolvePreview(nowPlaying.data.item);
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ type: 'playing', data: nowPlaying.data, preview }));
            }
            const recentlyPlayed = await axios.get(
                'https://api.spotify.com/v1/me/player/recently-played?limit=1',
                {
                    httpsAgent,
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );
            const lastTrack = recentlyPlayed.data.items[0].track;
            const preview = await resolvePreview(lastTrack);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ type: 'recent', data: lastTrack, preview }));

        } catch (error) {
            console.error('Spotify API error:', error.response?.data || error.message);
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: 'Failed to fetch Spotify data' }));
        }
    }
    next();
};