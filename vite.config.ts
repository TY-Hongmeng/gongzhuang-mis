import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'
  
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0')
    },
    plugins: [
      react({
        babel: {
          plugins: isProduction ? [] : ['react-dev-locator'],
        },
      }),
      tsconfigPaths(),
      // 仅在分析构建时启用
      process.env.ANALYZE === 'true' && visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    server: {
      port: 5182,
      host: 'localhost',
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
            const originalWeb = proxy.web;
            
            proxy.web = (req: any, res: any) => {
              const handleProxyError = (err: any) => {
                console.log(`Proxy error on port ${possiblePorts[currentPortIndex]}, trying port ${possiblePorts[currentPortIndex + 1]}`, err);
                currentPortIndex++;
                if (currentPortIndex < possiblePorts.length) {
                  proxy.target = `http://localhost:${possiblePorts[currentPortIndex]}`;
                  originalWeb.call(proxy, req, res);
                } else {
                  console.error('All proxy ports failed, giving up');
                  res.statusCode = 502;
                  res.end('Bad Gateway: Could not connect to API server');
                }
              };
              proxy.removeAllListeners('error');
              proxy.once('error', handleProxyError);
              originalWeb.call(proxy, req, res);
            };
          },
        }
      }
    },
    build: {
      target: 'es2015',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: isProduction,
          drop_debugger: isProduction,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            // 将第三方库单独打包
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-antd': ['antd', '@ant-design/icons', '@ant-design/charts'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-utils': ['dayjs', 'lodash-es', 'xlsx'],
          },
          // 控制代码块大小
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name || '';
            if (/\.css$/.test(info)) {
              return 'assets/css/[name]-[hash][extname]';
            }
            if (/\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp$/.test(info)) {
              return 'assets/images/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
      // 控制构建输出大小警告
      chunkSizeWarningLimit: 1000,
      // 启用 CSS 代码分割
      cssCodeSplit: true,
      // 启用 source map（生产环境可以关闭）
      sourcemap: !isProduction,
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'antd',
        '@supabase/supabase-js',
        'dayjs',
      ],
      exclude: [],
    },
    esbuild: {
      // 移除 console 和 debugger
      drop: isProduction ? ['console', 'debugger'] : [],
    },
  }
})
