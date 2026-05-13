import { validate } from 'class-validator';
import { CreateRecordRequestDTO } from './create-record.request.dto';
import { UpdateRecordRequestDTO } from './update-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';

describe('Record DTO validation', () => {
  it('rejects invalid MusicBrainz IDs on create', async () => {
    const dto = Object.assign(new CreateRecordRequestDTO(), {
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 25,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
      mbid: 'not-a-mbid',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'mbid')).toBe(true);
  });

  it('allows empty MusicBrainz IDs on create', async () => {
    const dto = Object.assign(new CreateRecordRequestDTO(), {
      artist: 'Sisters of Mercy',
      album: 'First and Last and Always',
      price: 20,
      qty: 3,
      format: RecordFormat.VINYL,
      category: RecordCategory.ALTERNATIVE,
      mbid: '',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('allows clearing MusicBrainz IDs on update', async () => {
    const dto = Object.assign(new UpdateRecordRequestDTO(), {
      mbid: '',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
