import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          400: '#14B8B3',
          500: '#0EA5A0',
          600: '#0D9488',
        },
      },
    },
  },
  plugins: [],
}

export default config
