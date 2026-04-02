<template>
 <div class="app-container">
   <div class="background" :style="backgroundStyle"></div>
   <div class="overlay">
     <div v-if="track">
       <img :src="track.album.images[0].url" alt="Album art" class="album__image" />
       <div class="song__name">{{ track.name }}</div>
       <div class="artiste__name">{{ track.artists[0].name }}</div>
       <div class="album__name">{{ track.album.name }}</div>
     </div>
     <div v-else-if="error">
       <p>{{ error }}</p>
     </div>
   </div>
 </div>
</template>


<script>
import axios from 'axios';


export default {
 data() {
   return {
     track: null,
     error: null,
     pollingInterval: null,
   };
 },


 computed: {
   backgroundStyle() {
     const imageUrl = this.track?.album?.images?.[0]?.url;
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
   async fetchNowPlaying() {
     try {
       const { data } = await axios.get('/api/now-playing');
       this.track = data.type === 'playing' ? data.data.item : data.data;


       document.title = `Charles ${data.type === ' is listening to' ? 'listening to' : 'last listened to'} ${this.track.name} by ${this.track.artists[0].name}`;
     } catch (err) {
       console.error(err);
       this.error = 'Could not get what Charles is listening to.';
     }
   },


   startPolling() {
     this.pollingInterval = setInterval(this.fetchNowPlaying, 5000);
   },
 },
};
</script>