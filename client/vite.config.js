import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true
            },
            // Avatars and JD files are served by the API server
            '/uploads': {
                target: 'http://localhost:5000',
                changeOrigin: true
            }
        }
    }
})
