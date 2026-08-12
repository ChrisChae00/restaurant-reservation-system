// ponytail: API and workers run in one process. Charge volume is a handful a day, so a
// single process is plenty. If the worker ever starts delaying API responses, split it
// into its own deployment — nothing here assumes they're colocated.
import express from 'express';
import pinoHttp from 'pino-http';
import { env } from './env.js';
import { logger } from './logger.js';
import { db } from './db.js';
import { connection } from './queue.js';
import { webhooksRouter } from './routes/webhooks.js';
import { adminRouter } from './routes/admin.js';
import { startChargeWorker } from './jobs/charge.worker.js';
import { startEmailWorker } from './jobs/email.worker.js';
import { startWebhookWorker } from './jobs/webhook.worker.js';
import { startScheduler } from './jobs/scheduler.js';

const app = express();
app.use(pinoHttp({ logger }));

app.use('/api/webhooks', webhooksRouter); // mounts its own raw-body parsing; must precede express.json()
app.use(express.json());
app.use('/api/admin', adminRouter);

app.get('/health', async (_req, res) => {
  try {
    await connection.ping();
    const { error } = await db().from('bookings').select('id').limit(1);
    if (error) throw error;
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    res.status(503).json({ status: 'degraded' });
  }
});

async function main() {
  startChargeWorker();
  startEmailWorker();
  startWebhookWorker();
  await startScheduler();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Backend listening');
  });
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start backend');
  process.exit(1);
});
