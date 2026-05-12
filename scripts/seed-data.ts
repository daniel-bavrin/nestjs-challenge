import * as fs from 'fs';
import * as mongoose from 'mongoose';
import * as readline from 'readline';
import { AppConfig } from '../src/app.config';

const COLLECTION_NAME = 'records';

type SeedRecord = {
  artist: string;
  album: string;
  price: number;
  qty: number;
  format: string;
  category: string;
  mbid?: string;
};

function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function seedData() {
  if (!AppConfig.mongoUrl) {
    throw new Error('MONGO_URL is required');
  }

  const data = JSON.parse(fs.readFileSync('data.json', 'utf-8')) as SeedRecord[];

  await mongoose.connect(AppConfig.mongoUrl);

  try {
    const records = mongoose.connection.db.collection(COLLECTION_NAME);

    const answer = await askQuestion(
      'Do you want to clean up the existing records collection? (Y/N): ',
    );

    if (answer.toLowerCase() === 'y') {
      await records.deleteMany({});
      console.log('Existing collection cleaned up.');
    }

    const result = await records.insertMany(data, { ordered: false });
    console.log(`Inserted ${Object.keys(result.insertedIds).length} records successfully!`);
  } finally {
    await mongoose.disconnect();
  }
}

seedData().catch(async (error) => {
  console.error('Error seeding database:', error);
  await mongoose.disconnect();
  process.exit(1);
});
