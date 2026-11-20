import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static assets for web dashboard (support both root and /static prefix)
  const staticPath = join(__dirname, '..', '..', 'static');
  app.useStaticAssets(staticPath);
  app.useStaticAssets(staticPath, { prefix: '/static' });

  // Enable pure WebSocket adapter for React Native mobile & Web Dashboard
  app.useWebSocketAdapter(new WsAdapter(app));

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
  });

  const PORT = process.env.PORT || 8000;
  await app.listen(PORT, '0.0.0.0');

  logger.log(`========================================================================`);
  logger.log(` 🌊 Smart Water Guardian - NestJS Backend Started!`);
  logger.log(` 📱 Mobile API / Web UI : http://0.0.0.0:${PORT}`);
  logger.log(` ⚡ WebSocket Stream    : ws://0.0.0.0:${PORT}/ws/live`);
  logger.log(`========================================================================`);
}

bootstrap();
