import { createApp } from './bootstrap';
import { env } from './config/env';
import { logger } from './common/logger';

async function main() {
  const app = await createApp();
  await app.listen(env().PORT);
  logger.info(`API listening on :${env().PORT}`);
}

main().catch((err) => {
  logger.fatal({ err }, 'API 기동 실패');
  process.exit(1);
});
