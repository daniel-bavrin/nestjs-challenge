import { MusicbrainzService } from './musicbrainz.service';

describe('MusicbrainzService', () => {
  let service: MusicbrainzService;

  beforeEach(() => {
    service = new MusicbrainzService();
    jest.restoreAllMocks();
  });

  it('returns parsed tracklist with fallback title and formatted durations', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <metadata>
        <release>
          <medium-list>
            <medium>
              <track-list>
                <track>
                  <number>1</number>
                  <title>  Intro Song  </title>
                  <length>61000</length>
                </track>
                <track>
                  <position>2</position>
                  <recording>
                    <title>Fallback Recording Title</title>
                  </recording>
                  <length>125000</length>
                </track>
                <track>
                  <number>3</number>
                  <recording>
                    <title>   </title>
                  </recording>
                </track>
              </track-list>
            </medium>
          </medium-list>
        </release>
      </metadata>`;

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      text: async () => xml,
    } as Response);

    const tracks = await service.fetchTracklistByMbid('abc-123');

    expect(tracks).toEqual([
      { position: 1, title: 'Intro Song', duration: '1:01' },
      { position: 2, title: 'Fallback Recording Title', duration: '2:05' },
    ]);
  });

  it('returns empty list when mbid is empty', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);

    const tracks = await service.fetchTracklistByMbid('');

    expect(tracks).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty list on non-OK MusicBrainz response', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    } as Response);

    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    const tracks = await service.fetchTracklistByMbid('missing');

    expect(tracks).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns empty list when request throws', async () => {
    jest
      .spyOn(global, 'fetch' as any)
      .mockRejectedValue(new Error('network down'));

    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    const tracks = await service.fetchTracklistByMbid('boom');

    expect(tracks).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
