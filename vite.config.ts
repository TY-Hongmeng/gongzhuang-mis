import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const appVersion = String(process.env.npm_package_version || pkg?.version || '0.0.0')

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isDevServer = command === 'serve'
  
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    plugins: [
      react({
        babel: isDevServer
          ? {
              plugins: [
                'react-dev-locator',
              ],
            }
          : undefined,
      }),
      tsconfigPaths(),
      legacy({
        targets: ['defaults', 'iOS >= 10', 'Safari >= 10'],
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
            if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'vendor-antd'
            if (id.includes('xlsx') || id.includes('file-saver')) return 'vendor-xlsx'
            if (id.includes('@supabase')) return 'vendor-supabase'
            return 'vendor'
          },
        },
      },
    },
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
