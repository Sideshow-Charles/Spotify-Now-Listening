const axios = require('axios');

let cachedToken = null;
let tokenExpiryTime = null;

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

module.exports = async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    const nowPlaying = await axios.get(
      'https://api.spotify.com/v1/me/player/currently-playing',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (nowPlaying.data && nowPlaying.data.is_playing) {
      return res.json({ type: 'playing', data: nowPlaying.data });
    }

    const recentlyPlayed = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=1',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return res.json({ type: 'recent', data: recentlyPlayed.data.items[0].track });

  } catch (error) {
    console.error('Spotify API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to fetch Spotify data' });
  }
};