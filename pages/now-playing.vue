<template>
    <div class="app-container">
        <div class="background" :style="backgroundStyle"></div>
        <div class="overlay">
            <div v-if="currentlyPlaying">
                <img :src="currentlyPlaying.item?.album?.images[0]?.url" alt="Currently playing track image" class="album__image" />
                <div class="song__name">{{ currentlyPlaying.item?.name }}</div>
                <div class="artiste__name">{{ currentlyPlaying.item?.artists[0]?.name }}</div>
                <div class="album__name">{{ currentlyPlaying.item?.album?.name }}</div>
            </div>
            <div v-else-if="lastPlayed">
                <img :src="lastPlayed.album?.images[0]?.url" alt="Last played track image" class="album__image" />
                <div class="song__name">{{ lastPlayed.name }}</div>
                <div class="artiste__name">{{ lastPlayed.artists[0]?.name }}</div>
                <div class="album__name">{{ lastPlayed.album?.name }}</div>
            </div>
            <div v-else-if="error">
                <p>Error: {{ error }}</p>
                <button @click="redirectToLogin">Go to Login</button>
            </div>
            <!-- <p v-else-if="loading" class="app">Hang On, Let's Get While We Get What Charles Is Listening To</p> -->
        </div>
    </div>
</template>

<script>
import axios from 'axios';

export default {
    data() {
        return {
            accessToken: '',
            refreshToken: '',
            error: '',
            loading: true,
            currentlyPlaying: null,
            lastPlayed: null,
            pollingInterval: null,
            tokenExpiryTime: null,
        };
    },
    computed: {
        backgroundStyle() {
            const imageUrl = this.currentlyPlaying?.item?.album?.images?.[0]?.url || this.lastPlayed?.album?.images?.[0]?.url;

            return imageUrl
                ? {
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }
                : {};
        },
    },
    methods: {
        redirectToLogin() {
            this.$router.push('/');
        },

        async processSpotifyCode() {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');

            if (code) {
                try {
                    const clientID = process.env.SPOTIFY_CLIENT_ID;
                    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
                    const redirectURI = window.location.origin + '/now-playing';

                    const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: redirectURI,
                    }), {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            Authorization: `Basic ${btoa(`${clientID}:${clientSecret}`)}`,
                        },
                    });

                    this.accessToken = response.data.access_token;
                    this.refreshToken = response.data.refresh_token;
                    localStorage.setItem('access_token', this.accessToken);
                    localStorage.setItem('refresh_token', this.refreshToken);
                    this.tokenExpiryTime = Date.now() + response.data.expires_in * 1000;
                    localStorage.setItem('tokenExpiryTime', this.tokenExpiryTime);
                    this.cleanUpUrl(); // Clean up immediately after successful token exchange
                    await this.fetchCurrentlyPlaying();
                } catch (error) {
                    console.error('Error fetching access token:', error.response ? error.response.data : error);
                    this.error = 'Failed to obtain access token';
                    this.redirectToLogin();
                } finally {
                    this.loading = false; // Ensure loading is set to false
                }
            } else {
                // If no code in the URL, attempt to load existing tokens after the component is mounted
                this.loading = false;
            }
        },

        async refreshAccessToken() {
            try {
                const clientID = process.env.SPOTIFY_CLIENT_ID;
                const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

                const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                }), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Basic ${btoa(`${clientID}:${clientSecret}`)}`,
                    },
                });

                this.accessToken = response.data.access_token;
                localStorage.setItem('access_token', this.accessToken);
                this.tokenExpiryTime = Date.now() + response.data.expires_in * 1000;
                localStorage.setItem('tokenExpiryTime', this.tokenExpiryTime);
                console.log("Access token refreshed successfully");
            } catch (error) {
                console.error('Error refreshing access token:', error.response ? error.response.data : error);
                this.error = 'Failed to refresh access token';
                this.redirectToLogin();
            }
        },

        tokenNotExpired() {
            return this.tokenExpiryTime && Date.now() < this.tokenExpiryTime;
        },

        cleanUpUrl() {
            const url = new URL(window.location.href);
            if (url.searchParams.has('code')) {
                url.searchParams.delete('code');
                window.history.replaceState({}, document.title, url.toString());
            }
        },

        async fetchCurrentlyPlaying() {
            if (!this.accessToken) {
                console.error('Access token is not available');
                this.error = 'Access token is not available';
                this.redirectToLogin();
                return;
            }

            this.loading = true;

            try {
                const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                });

                if (response.data && response.data.is_playing) {
                    this.currentlyPlaying = response.data;
                    document.title = `Charles is currently listening to ${this.currentlyPlaying.item.name} by ${this.currentlyPlaying.item.artists[0].name}`;
                } else {
                    await this.fetchLastPlayed();
                }
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    await this.refreshAccessToken();
                    await this.fetchCurrentlyPlaying();
                } else {
                    console.error('Error fetching currently playing track:', error.response ? error.response.data : error);
                    this.error = 'Failed to fetch currently playing track';
                }
            } finally {
                this.loading = false;
            }
        },

        async fetchLastPlayed() {
            try {
                const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                });

                if (response.data.items && response.data.items.length > 0) {
                    this.lastPlayed = response.data.items[0].track;
                    // document.title = `Charles was last listening to ${this.lastPlayed.name} by ${this.lastPlayed.artists[0].name}`;
                }
            } catch (error) {
                console.error('Error fetching last played track:', error.response ? error.response.data : error);
                this.error = 'Failed to fetch last played track';
            }
        },

        startPolling() {
            this.pollingInterval = setInterval(() => {
                this.fetchCurrentlyPlaying();
            }, 5000);
        },
    },

    async beforeMount() {
        this.loading = true;
        await this.processSpotifyCode();
    },

    async mounted() {
        // Load tokens from localStorage after the component is mounted (client-side)
        this.accessToken = localStorage.getItem('access_token') || this.accessToken;
        this.refreshToken = localStorage.getItem('refresh_token') || this.refreshToken;
        this.tokenExpiryTime = localStorage.getItem('tokenExpiryTime') ? parseInt(localStorage.getItem('tokenExpiryTime')) : this.tokenExpiryTime;

        if (this.accessToken && this.tokenNotExpired()) {
            await this.fetchCurrentlyPlaying();
        } else if (this.refreshToken) {
            await this.refreshAccessToken();
        } else if (!window.location.search.includes('code') && !this.accessToken) {
            this.redirectToLogin();
        }

        this.startPolling();
    },

    beforeDestroy() {
        clearInterval(this.pollingInterval);
    },
};
</script>