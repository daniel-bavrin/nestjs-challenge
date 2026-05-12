import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { Track } from '../schemas/record.schema';
import { TracklistProvider } from '../interfaces/tracklist-provider.interface';

interface MusicBrainzTrackNode {
  title?: string;
  length?: string | number;
  number?: string | number;
  position?: string | number;
}

@Injectable()
export class MusicbrainzService implements TracklistProvider {
  private readonly logger = new Logger(MusicbrainzService.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });

  async fetchTracklist(externalId: string): Promise<Track[]> {
    return this.fetchTracklistByMbid(externalId);
  }

  async fetchTracklistByMbid(mbid: string): Promise<Track[]> {
    if (!mbid) {
      return [];
    }

    try {
      const response = await fetch(
        `https://musicbrainz.org/ws/2/release/${encodeURIComponent(mbid)}?inc=recordings&fmt=xml`,
        {
          headers: {
            'User-Agent': 'broken-record-store-api/1.0 (phase-3-enrichment)',
            Accept: 'application/xml',
          },
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `MusicBrainz lookup failed for MBID ${mbid}: ${response.status}`,
        );
        return [];
      }

      const xml = await response.text();
      return this.extractTracklist(xml);
    } catch (error) {
      this.logger.warn(
        `MusicBrainz request failed for MBID ${mbid}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private extractTracklist(xml: string): Track[] {
    const parsed = this.parser.parse(xml) as Record<string, any>;
    const metadata = parsed?.metadata;
    const release = metadata?.release;
    const mediumList = release?.['medium-list'];
    const mediums = this.toArray(mediumList?.medium);

    const tracks: Track[] = [];

    for (const medium of mediums) {
      const trackListNode = medium?.['track-list'];
      const trackNodes = this.toArray(
        trackListNode?.track,
      ) as MusicBrainzTrackNode[];

      for (const [index, trackNode] of trackNodes.entries()) {
        const title = this.extractTrackTitle(trackNode);
        if (!title) {
          continue;
        }

        tracks.push({
          position: this.toPositiveNumber(
            trackNode.position ?? trackNode.number,
            index + 1,
          ),
          title,
          duration: this.formatTrackLength(trackNode.length),
        });
      }
    }

    return tracks;
  }

  private extractTrackTitle(trackNode: any): string | undefined {
    if (typeof trackNode?.title === 'string' && trackNode.title.trim()) {
      return trackNode.title.trim();
    }

    const recordingTitle = trackNode?.recording?.title;
    if (typeof recordingTitle === 'string' && recordingTitle.trim()) {
      return recordingTitle.trim();
    }

    return undefined;
  }

  private formatTrackLength(length?: string | number): string | undefined {
    if (length === undefined || length === null) {
      return undefined;
    }

    const milliseconds = Number(length);
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      return undefined;
    }

    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private toPositiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }

  private toArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }
}
