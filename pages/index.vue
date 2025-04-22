<template>
  <div class="app">
    <p class="base__text" v-if="loading">Hang On, Let's Get While We Get What Charles Is Listening To</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      loading: false,
      authError: null,
      token: null,
    };
  },
  mounted() {
    this.handleLogin();
  },

  methods: {
    handleLogin() {
      this.loading = true;
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const redirectUri = window.location.origin + '/now-playing';
      const scope = 'user-read-currently-playing user-read-playback-state user-read-recently-played';
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
      window.location.href = authUrl;
    },
  },
};
</script>