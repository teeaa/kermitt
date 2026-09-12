import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'tailwind-css-hmr',
      handleHotUpdate({ file, server }) {
        if (/\.(tsx|ts|html)$/.test(file)) {
          const styleModule = server.moduleGraph.getModuleById(
            path.resolve(__dirname, 'src/style.css')
          );
          if (styleModule) {
            server.moduleGraph.invalidateModule(styleModule);
            server.ws.send({
              type: 'update',
              updates: [
                {
                  type: 'js-update',
                  path: '/src/style.css',
                  acceptedPath: '/src/style.css',
                  timestamp: Date.now(),
                },
              ],
            });
          }
        }
      },
    },
  ],
});
