import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: [
    './app.vue',
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0B6E4F',
          dark: '#084C38',
          light: '#D9F5EA'
        }
      }
    }
  },
  plugins: []
} satisfies Config
