import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { config } from './config';
import { runMigrations, createAdminUser } from './db/migrations';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import nodeRoutes from './routes/nodes';
import proxyRoutes from './routes/proxies';
import allProxiesRoutes from './routes/allProxies';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/nodes', proxyRoutes);
app.use('/api/proxies', allProxiesRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/system/version', authMiddleware, (_req, res) => {
  let version = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
    version = pkg.version || 'unknown';
  } catch {}
  res.json({ version });
});

const PROJECT_DIR = '/app/project';
const UPDATER_CONTAINER = 'mtproto-panel-updater';

// Trigger panel self-update. update.sh hands the work to a sidecar container and returns
// at once: run here, `docker compose down` would kill this container together with the
// script and leave the panel down. The outcome is read later from /api/system/update/log.
app.post('/api/system/update', authMiddleware, (_req, res) => {
  execFile('/bin/bash', [join(PROJECT_DIR, 'update.sh')], { cwd: PROJECT_DIR, timeout: 60000 }, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ success: false, error: error.message, output: stderr || stdout });
      return;
    }
    res.json({ success: true, output: stdout, async: stdout.includes(UPDATER_CONTAINER) });
  });
});

// Result of the last self-update. The request that started it cannot report the outcome:
// its container is replaced mid-way, so the page polls this until the sidecar exits.
app.get('/api/system/update/log', authMiddleware, (_req, res) => {
  execFile(
    'docker',
    ['inspect', UPDATER_CONTAINER, '--format', '{{.State.Running}} {{.State.ExitCode}}'],
    { timeout: 15000 },
    (error, stdout) => {
      const exists = !error;
      const [runningRaw, exitRaw] = exists ? stdout.trim().split(' ') : [];
      const running = runningRaw === 'true';
      const finished = exists && !running;
      const logPath = join(PROJECT_DIR, 'update.log');
      const hasLog = existsSync(logPath);
      res.json({
        exists,
        running,
        exitCode: finished ? Number(exitRaw) : null,
        output: hasLog ? readFileSync(logPath, 'utf-8') : '',
        finishedAt: finished && hasLog ? statSync(logPath).mtime.toISOString() : null,
      });
    },
  );
});

async function bootstrap(): Promise<void> {
  try {
    await runMigrations();

    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;
    if (adminUser && adminPass) {
      await createAdminUser(adminUser, adminPass);
    }

    app.listen(config.port, '0.0.0.0', () => {
      console.log(`Panel backend running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start panel backend:', error);
    process.exit(1);
  }
}

bootstrap();
