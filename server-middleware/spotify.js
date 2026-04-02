const axios = require('axios');
const https = require('https');


const httpsAgent = new https.Agent({
 rejectUnauthorized: process.env.NODE_ENV === 'production'
});


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


module.exports = async function (req, res, next) {
 if (req.url === '/now-playing') {
   try {
     const accessToken = await getAccessToken();


     const nowPlaying = await axios.get(
       'https://api.spotify.com/v1/me/player/currently-playing',
       {
         httpsAgent,
         headers: { Authorization: `Bearer ${accessToken}` },
       }
     );


     if (nowPlaying.data && nowPlaying.data.is_playing) {
       res.setHeader('Content-Type', 'application/json');
       return res.end(JSON.stringify({ type: 'playing', data: nowPlaying.data }));
     }


     const recentlyPlayed = await axios.get(
       'https://api.spotify.com/v1/me/player/recently-played?limit=1',
       {
         httpsAgent,
         headers: { Authorization: `Bearer ${accessToken}` },
       }
     );


     const lastTrack = recentlyPlayed.data.items[0].track;
     res.setHeader('Content-Type', 'application/json');
     return res.end(JSON.stringify({ type: 'recent', data: lastTrack }));


   } catch (error) {
     console.error('Spotify API error:', error.response?.data || error.message);
     res.statusCode = 500;
     return res.end(JSON.stringify({ error: 'Failed to fetch Spotify data' }));
   }
 }


 next();
};
