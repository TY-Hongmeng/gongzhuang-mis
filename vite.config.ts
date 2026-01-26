import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 检查后端服务实际运行的端口
  let apiPort = 3003; // 默认端口
  
  return {
    base: './',
    plugins: [
      react({
        babel: {
          plugins: [
            'react-dev-locator',
          ],
        },
      }),
      traeBadgePlugin({
        variant: 'dark',
        position: 'bottom-right',
        prodOnly: true,
        clickable: true,
        clickUrl: 'https://www.trae.ai/solo?showJoin=1',
        autoTheme: true,
        autoThemeTarget: '#root'
      }), 
      tsconfigPaths(),
    ],
    server: {
      port: 5182,
      host: 'localhost',
      strictPort: false,
      hmr: {
        overlay: false,
      },
      proxy: {
        '/api': {
          // 尝试先连接3003端口，如果失败则依次尝试其他可能的端口
          target: `http://localhost:3003`,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            // 后端可能使用的端口列表，与api/server.ts保持一致
            const possiblePorts = [3003, 3010, 3020, 3030, 3040];
            let currentPortIndex = 0;
            
            // 保存原始的请求处理函数
            const originalWeb = proxy.web;
            
            // 自定义请求处理函数，支持端口重试
            proxy.web = (req: any, res: any) => {
              const handleProxyError = (err: any) => {
                console.log(`Proxy error on port ${possiblePorts[currentPortIndex]}, trying port ${possiblePorts[currentPortIndex + 1]}`, err);
                currentPortIndex++;
                
                if (currentPortIndex < possiblePorts.length) {
                  // 尝试下一个端口
                  proxy.target = `http://localhost:${possiblePorts[currentPortIndex]}`;
                  // 重新发起请求
                  originalWeb.call(proxy, req, res);
                } else {
                  // 所有端口都尝试失败，返回错误
                  console.error('All proxy ports failed, giving up');
                  res.statusCode = 502;
                  res.end('Bad Gateway: Could not connect to API server');
                }
              };
              
              // 移除之前的错误监听器，避免重复触发
              proxy.removeAllListeners('error');
              // 添加新的错误监听器
              proxy.once('error', handleProxyError);
              // 发起请求
              originalWeb.call(proxy, req, res);
            };
            
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url, `(port: ${possiblePorts[currentPortIndex]})`);
            });
            
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url, `(port: ${possiblePorts[currentPortIndex]})`);
            });
          },
        }
      }
    }
  }
})
