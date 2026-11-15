import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { RequestLoggingMiddleware } from './common/request-logging.middleware.js';
import { runMigration } from './migrations/run-migration.js';

async function bootstrap() {
  try {
    await runMigration();
  } catch (err) {
    console.error('[Migration] Auto-migration warning:', err);
  }

  const app = await NestFactory.create(AppModule);
  const requestLogger = new RequestLoggingMiddleware();
  app.use(requestLogger.use.bind(requestLogger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
