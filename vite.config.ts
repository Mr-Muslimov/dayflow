import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const isUserSite = repositoryName?.endsWith('.github.io') ?? false
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName && !isUserSite
  ? `/${repositoryName}/`
  : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['dayflow.svg'],
      manifest: {
        name: 'DayFlow — умный планировщик',
        short_name: 'DayFlow',
        description: 'Задачи, календарь и привычки в одном пространстве.',
        theme_color: '#141817',
        background_color: '#141817',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: `${base}dayflow.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})
