import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { RecordModule } from './api/record.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfig } from './app.config';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/admin',
    }),
    MongooseModule.forRoot(AppConfig.mongoUrl),
    BullModule.forRoot({
      connection: { host: AppConfig.redisHost, port: AppConfig.redisPort },
    }),
    RecordModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
