import { defineConfig, loadEnv } from 'vite'
import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0')
    },
    plugins: [
      react({
        babel: {
          plugins: [
            'react-dev-locator',
          ],
        },
      }),
      tsconfigPaths(),
      legacy({
        targets: ['defaults', 'iOS >= 11', 'Safari >= 11'],
        renderModernChunks: false,
      }),
    ],
    server: {
      port: 5182,
      host: true,
      strictPort: false,
      hmr: {
        overlay: false,
      },
      proxy: {
        '/api': {
          target: `http://localhost:3003`,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            const possiblePorts = [3003, 3010, 3020, 3030, 3040];
            let currentPortIndex = 0;
            
            proxy.on('error', (err, req, res) => {
              console.log(`Proxy error on port ${possiblePorts[currentPortIndex]}, trying next port`);
              currentPortIndex++;
              
              if (currentPortIndex < possiblePorts.length) {
                const target = `http://localhost:${possiblePorts[currentPortIndex]}`;
                console.log(`Retrying with target: ${target}`);
                // 更新 target 并重新尝试
                (proxy as any).options.target = target;
              } else {
                console.error('All proxy ports failed');
                (res as any).statusCode = 502;
                (res as any).end('Bad Gateway: Could not connect to API server');
              }
            });
            
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Proxy Request:', req.method, req.url);
            });
            
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Proxy Response:', proxyRes.statusCode, req.url);
            });
          },
        }
      }
    }
  }
})
