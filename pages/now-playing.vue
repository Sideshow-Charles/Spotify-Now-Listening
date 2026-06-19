<template>
  <div class="app-container">
    <div class="background" :style="backgroundStyle"></div>
    <div class="overlay">
      <div v-if="media">
        <img :src="media.image" alt="Cover art" class="album__image" />
        <div class="song__name">{{ media.title }}</div>
        <div class="artiste__name">{{ media.subtitle }}</div>
        <div class="album__name">{{ media.context }}</div>
      </div>
      <div v-else-if="error" class="state__screen">
        <div class="state__icon">
          <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p class="state__text">{{ error }}</p>
        <p class="state__hint">Probably nothing playing right now. Check back in a bit.</p>
      </div>
      <div v-else class="state__screen">
        <div class="state__pulse"></div>
        <p class="state__text">Tuning in&hellip;</p>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
    data() {
        return {
            media: null,
            error: null,
            pollingInterval: null,
        };
    },
    computed: {
        backgroundStyle() {
            const imageUrl = this.media?.image;
            return imageUrl
                ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : {};
        },
    },
    async mounted() {
        await this.fetchNowPlaying();
        this.startPolling();
    },
    beforeDestroy() {
        clearInterval(this.pollingInterval);
    },
    methods: {
        normalize(item) {
            if (!item) return null;
            // Podcast episode shape
            if (item.type === 'episode') {
                return {
                    title: item.name,
                    subtitle: item.show?.publisher || item.show?.name || 'Podcast',
                    context: item.show?.name || '',
                    image: item.images?.[0]?.url || item.show?.images?.[0]?.url || '',
                };
            }
            // Track shape
            return {
                title: item.name,
                subtitle: item.artists?.[0]?.name || '',
                context: item.album?.name || '',
                image: item.album?.images?.[0]?.url || '',
            };
        },
        async fetchNowPlaying() {
            try {
                const { data } = await axios.get('/api/now-playing');
                const item = data.type === 'playing' ? data.data.item : data.data;
                const media = this.normalize(item);

                if (!media) {
                    this.media = null;
                    this.error = 'Could not get what Charles is listening to.';
                    return;
                }

                this.media = media;
                this.error = null;

                const verb = data.type === 'playing' ? 'is listening to' : 'last listened to';
                document.title = media.subtitle
                    ? `Charles ${verb} ${media.title} by ${media.subtitle}`
                    : `Charles ${verb} ${media.title}`;
            } catch (err) {
                console.error(err);
                this.media = null;
                this.error = 'Could not get what Charles is listening to.';
            }
        },
        startPolling() {
            this.pollingInterval = setInterval(this.fetchNowPlaying, 5000);
        },
    },
};
</script>