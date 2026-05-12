import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { RecordController } from './controllers/record.controller';
import { RecordV1Controller } from './controllers/record.v1.controller';
import { MusicbrainzService } from './services/musicbrainz.service';
import { RecordService } from './services/record.service';
import { RecordSchema } from './schemas/record.schema';
import { TracklistProcessor } from './jobs/tracklist.processor';
import {
  REDIS_CLIENT,
  TRACKLIST_QUEUE,
} from './jobs/tracklist-queue.constants';
import { TRACKLIST_PROVIDER } from './interfaces/tracklist-provider.interface';
import { AppConfig } from '../app.config';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Record', schema: RecordSchema }]),
    BullModule.registerQueue({
      name: TRACKLIST_QUEUE,
    }),
  ],
  controllers: [RecordController, RecordV1Controller],
  providers: [
    RecordService,
    MusicbrainzService,
    TracklistProcessor,
    {
      provide: TRACKLIST_PROVIDER,
      useExisting: MusicbrainzService,
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis({ host: AppConfig.redisHost, port: AppConfig.redisPort }),
    },
  ],
})
export class RecordModule {}
