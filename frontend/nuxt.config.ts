export default defineNuxtConfig({
  compatibilityDate: '2026-02-21',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  modules: ['@nuxtjs/tailwindcss', '@nuxtjs/i18n', '@nuxtjs/color-mode'],
  typescript: {
    strict: true,
    typeCheck: false,
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000',
    },
  },
  i18n: {
    locales: [
      { code: 'ru', name: 'Русский' },
      { code: 'en', name: 'English' },
    ],
    defaultLocale: 'ru',
    strategy: 'no_prefix',
    vueI18n: './i18n.config.ts',
    bundle: {
      optimizeTranslationDirective: false,
    },
  },
  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
  },
  app: {
    head: {
      title: 'Multimodal RAG GPT',
      meta: [
        {
          name: 'description',
          content: 'Frontend for multimodal RAG application',
        },
      ],
    },
  },
})
