/**
 * local server entry file, for local development
 */
import app from './app.js';
import { runAutoMigrate } from './migrate.js'

/**
 * start server with port (auto-fallback if in use)
 */
const envPort = Number(process.env.PORT) || 3003;
const candidates = [envPort, 3003, 3010, 3020, 3030, 3040];
let server: any;

const tryListen = (ports: number[], idx = 0) => {
  const port = ports[idx];
  const s = app.listen(port, () => {
    console.log(`Server ready on port ${port}`);
  });
  s.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE' && idx < ports.length - 1) {
      console.warn(`Port ${port} in use, trying ${ports[idx + 1]}`);
      tryListen(ports, idx + 1);
    } else {
      console.error('Server start error:', err);
    }
  });
  server = s;
};

runAutoMigrate().then(() => {
  tryListen(candidates);
}).catch(() => {
  tryListen(candidates);
});


/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
