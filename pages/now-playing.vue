<template>
    <div class="app-container">
        <div class="background" :style="backgroundStyle"></div>
        <div class="overlay">
            <div v-if="media">
                <div class="album__art">
                    <div v-if="showHint" class="album__hint" aria-hidden="true">
                        <span class="album__hint-text album__hint-text--pointer">Click the album cover for a preview</span>
                        <span class="album__hint-text album__hint-text--touch">Tap the album cover for a preview</span>
                    </div>
                    <img
                        :src="media.image"
                        alt="Cover art"
                        class="album__image"
                        :class="{ 'album__image--playable': !!previewUrl }"
                        :role="previewUrl ? 'button' : null"
                        :tabindex="previewUrl ? 0 : null"
                        :aria-label="previewUrl ? previewLabel : null"
                        :aria-pressed="previewUrl ? String(previewState === 'playing') : null"
                        @click="togglePreview"
                        @keydown.enter.prevent="togglePreview"
                        @keydown.space.prevent="togglePreview"
                    />
                </div>
                <div class="song__name">{{ media.title }}</div>
                <div class="artiste__name">{{ media.subtitle }}</div>
                <div class="album__name">{{ media.context }}</div>
            </div>
            <div v-else class="state__screen">
                <p class="state__text">{{ error }}</p>
            </div>
        </div>
    </div>
</template>

<script>
import axios from 'axios';

const HINT_STORAGE_KEY = 'preview-hint-dismissed';

export default {
    data() {
        return {
            media: null,
            error: null,
            pollingInterval: null,
            previewUrl: null,
            previewState: 'idle', // idle | playing | paused
            hintDismissed: false,
        };
    },
    computed: {
        backgroundStyle() {
            const imageUrl = this.media?.image;
            return imageUrl
                ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : {};
        },
        previewLabel() {
            if (!this.media) return '';
            const action = this.previewState === 'playing' ? 'Pause' : 'Play';
            const what = this.media.subtitle ? `${this.media.title} by ${this.media.subtitle}` : this.media.title;
            return `${action} preview of ${what}`;
        },
        showHint() {
            return !!this.previewUrl && !this.hintDismissed && this.previewState === 'idle';
        },
    },
    created() {
        this.audio = null;
    },
    async mounted() {
        await this.fetchNowPlaying();
        this.startPolling();
    },
    beforeDestroy() {
        this.cleanup();
    },
    beforeUnmount() {
        this.cleanup();
    },
    methods: {
        normalize(item) {
            if (!item) return null;
            // Podcast episode shape
            if (item.type === 'episode') {
                return {
                    id: item.id,
                    title: item.name,
                    subtitle: item.show?.publisher || item.show?.name || 'Podcast',
                    context: item.show?.name || '',
                    image: item.images?.[0]?.url || item.show?.images?.[0]?.url || '',
                };
            }
            // Track shape
            return {
                id: item.id,
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
                    this.stopPreview();
                    this.previewUrl = null;
                    this.media = null;
                    this.error = 'Could not get what Charles is listening to.';
                    return;
                }

                this.syncPreview(media.id, data.preview || null);
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
        cleanup() {
            clearInterval(this.pollingInterval);
            this.stopPreview();
            if (this.audio) {
                this.audio.removeEventListener('play', this.onPreviewPlay);
                this.audio.removeEventListener('pause', this.onPreviewPause);
                this.audio.removeEventListener('ended', this.onPreviewEnded);
                this.audio.removeEventListener('error', this.onPreviewError);
                this.audio = null;
            }
        },
        dismissHint() {
            if (this.hintDismissed) return;
            this.hintDismissed = true;
            try {
                localStorage.setItem(HINT_STORAGE_KEY, '1');
            } catch {
                /* storage unavailable; hint just reappears next visit */
            }
        },

        // --- Preview playback ---
        syncPreview(id, url) {
            const trackChanged = !this.media || this.media.id !== id;
            if (trackChanged) {
                this.stopPreview();
                this.previewUrl = url;
                return;
            }
            // Same track: pick up a refreshed signed URL, but never swap mid-playback.
            if (this.previewState === 'idle') this.previewUrl = url;
        },
        getAudio() {
            if (this.audio) return this.audio;
            const audio = new Audio();
            audio.preload = 'none';
            audio.addEventListener('play', this.onPreviewPlay);
            audio.addEventListener('pause', this.onPreviewPause);
            audio.addEventListener('ended', this.onPreviewEnded);
            audio.addEventListener('error', this.onPreviewError);
            this.audio = audio;
            return audio;
        },
        togglePreview() {
            if (!this.previewUrl) return;
            const audio = this.getAudio();

            if (this.previewState === 'playing') {
                audio.pause();
                return;
            }
            if (audio.getAttribute('src') !== this.previewUrl) {
                audio.src = this.previewUrl;
            }
            audio.volume = 0.6;
            const attempt = audio.play();
            if (attempt && attempt.catch) {
                attempt.catch(() => {
                    this.previewState = 'idle';
                });
            }
        },
        stopPreview() {
            this.previewState = 'idle';
            if (!this.audio) return;
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
        },
        onPreviewPlay() {
            this.previewState = 'playing';
            this.dismissHint();
        },
        onPreviewPause() {
            if (this.previewState === 'playing') this.previewState = 'paused';
        },
        onPreviewEnded() {
            this.previewState = 'idle';
            if (this.audio) this.audio.currentTime = 0;
        },
        onPreviewError() {
            // Ignore errors from clearing src. Otherwise the signed URL likely expired;
            // reset so the next poll's fresh URL gets used.
            if (!this.audio || !this.audio.getAttribute('src')) return;
            this.stopPreview();
        },
    },
};
</script>