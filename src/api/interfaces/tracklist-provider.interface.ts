import { Track } from '../schemas/record.schema';

export const TRACKLIST_PROVIDER = 'TRACKLIST_PROVIDER';

export interface TracklistProvider {
  fetchTracklist(externalId: string): Promise<Track[]>;
}
