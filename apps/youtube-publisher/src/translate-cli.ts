import minimist from 'minimist';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ensureTranslations } from './translate';

// Load environment variables from the root .env file
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

const argv = minimist(process.argv.slice(2));
const kuralNum = parseInt(argv['kural'], 10);

if (!isNaN(kuralNum)) {
  console.log(`\n--- Running Translation Sync for Kural ${kuralNum} ---`);
  ensureTranslations(kuralNum)
    .then(() => {
      console.log(`Translation Sync Complete for Kural ${kuralNum}\n`);
    })
    .catch(err => {
      console.error('Translation Sync Failed:', err);
      process.exit(1);
    });
} else {
  console.error("Usage: npm run translate -- --kural=N");
  process.exit(1);
}
