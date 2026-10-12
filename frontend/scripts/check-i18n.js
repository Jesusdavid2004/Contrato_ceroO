import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.resolve(__dirname, '../src/locales');
const enPath = path.join(localesDir, 'en.json');
const esPath = path.join(localesDir, 'es.json');

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

try {
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const esData = JSON.parse(fs.readFileSync(esPath, 'utf8'));

  const enKeys = new Set(getAllKeys(enData));
  const esKeys = new Set(getAllKeys(esData));

  const missingInEs = [...enKeys].filter(k => !esKeys.has(k));
  const missingInEn = [...esKeys].filter(k => !enKeys.has(k));

  if (missingInEs.length > 0 || missingInEn.length > 0) {
    console.error('❌ i18n parity check failed:');
    if (missingInEs.length > 0) {
      console.error(`Missing in es.json (${missingInEs.length}):`, missingInEs);
    }
    if (missingInEn.length > 0) {
      console.error(`Missing in en.json (${missingInEn.length}):`, missingInEn);
    }
    process.exit(1);
  }

  console.log(`✅ i18n parity check passed: en.json and es.json are synchronized with ${enKeys.size} keys.`);
} catch (error) {
  console.error('Error reading translation files:', error);
  process.exit(1);
}
