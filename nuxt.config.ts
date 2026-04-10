// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxtjs/supabase',
    '@nuxt/icon',
  ],

  css: ['~/assets/css/main.css'],

  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      include: ['/dashboard(/*)?'],
      exclude: ['/', '/woningen(/*)?', '/inzichten'],
    },
  },

  runtimeConfig: {
    apiKey: process.env.API_KEY,
    apifyApiToken: process.env.APIFY_API_TOKEN,
    openaiApiKey: process.env.OPENAI_API_KEY,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
    resendApiKey: process.env.RESEND_API_KEY,
  },

  icon: {
    provider: 'iconify',
  },
})
