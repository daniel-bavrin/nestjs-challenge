import { Module } from '@nestjs/common';
import { RecordModule } from './api/record.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfig } from './app.config';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
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
