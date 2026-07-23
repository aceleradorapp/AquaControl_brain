import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        // Encaminha chamadas de API pro server Express (porta 5000) durante o
        // desenvolvimento, assim o front-end pode chamar "/api/..." sem precisar
        // hardcodar "http://localhost:5000" nem lidar com CORS no dia a dia.
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true,
            },
        },
    },
});
