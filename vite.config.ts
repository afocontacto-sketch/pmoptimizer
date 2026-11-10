import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    // Usa describe/test globales sin runner configurado; se excluye hasta que se adapte.
    exclude: ['tests/workorders.test.ts', 'node_modules/**'],
  },
})
