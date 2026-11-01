import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(__dirname, '../src');
const LOCALES_DIR = path.resolve(SRC_DIR, 'i18n/locales');
const RU_PATH = path.resolve(LOCALES_DIR, 'ru.json');
const KY_PATH = path.resolve(LOCALES_DIR, 'ky.json');
const EN_PATH = path.resolve(LOCALES_DIR, 'en.json');

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function unflattenObject(flat) {
  const result = {};
  const sortedKeys = Object.keys(flat).sort();
  for (const key of sortedKeys) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = flat[key];
  }
  return result;
}

// Translations for phrases and terms
const TRANSLATION_MAP = {
  'Склад': { ky: 'Кампа', en: 'Warehouse' },
  'Завод': { ky: 'Завод', en: 'Factory' },
  'Водитель': { ky: 'Айдоочу', en: 'Driver' },
  'Водители': { ky: 'Айдоочулар', en: 'Drivers' },
  'Товар': { ky: 'Товар', en: 'Product' },
  'Товары': { ky: 'Товарлар', en: 'Products' },
  'Заявка': { ky: 'Буйрутма', en: 'Order' },
  'Заявки': { ky: 'Буйрутмалар', en: 'Orders' },
  'Поставка': { ky: 'Жеткирүү', en: 'Reception' },
  'Поставки': { ky: 'Жеткирүүлөр', en: 'Receptions' },
  'Возврат': { ky: 'Кайтаруу', en: 'Return' },
  'Возвраты': { ky: 'Кайтаруулар', en: 'Returns' },
  'Касса': { ky: 'Касса', en: 'Cashbox' },
  'Платежи': { ky: 'Төлөмдөр', en: 'Payments' },
  'Отчеты': { ky: 'Отчеттор', en: 'Reports' },
  'Синхронизация': { ky: 'Синхрондоштуруу', en: 'Synchronization' },
  'Синхронизирован': { ky: 'Синхрондоштурулду', en: 'Synced' },
  'Ожидает': { ky: 'Күтүүдө', en: 'Pending' },
  'Ошибка': { ky: 'Ката', en: 'Error' },
  'В обработке': { ky: 'Иштетилүүдө', en: 'Processing' },
  'Выполнено': { ky: 'Аткарылды', en: 'Completed' },
  'Доставлено': { ky: 'Жеткирилди', en: 'Delivered' },
  'Отклонено': { ky: 'Четке кагылды', en: 'Rejected' },
  'Сумма': { ky: 'Сумма', en: 'Amount' },
  'Количество': { ky: 'Саны', en: 'Quantity' },
  'Коробок': { ky: 'Куту', en: 'Boxes' },
  'Штук': { ky: 'Даана', en: 'Pieces' },
  'Штук мороженого': { ky: 'Балмуздак даанасы', en: 'Ice cream pieces' },
  'Долг': { ky: 'Карыз', en: 'Debt' },
  'Баланс': { ky: 'Баланс', en: 'Balance' },
  'Остаток': { ky: 'Калдык', en: 'Stock' },
  'Дата': { ky: 'Күнү', en: 'Date' },
  'Статус': { ky: 'Абалы', en: 'Status' },
  'Действия': { ky: 'Аракеттер', en: 'Actions' },
  'Сохранить': { ky: 'Сактоо', en: 'Save' },
  'Отмена': { ky: 'Жокко чыгаруу', en: 'Cancel' },
  'Удалить': { ky: 'Өчүрүү', en: 'Delete' },
  'Создать': { ky: 'Түзүү', en: 'Create' },
  'Поиск': { ky: 'Издөө', en: 'Search' },
  'Фильтр': { ky: 'Чыпка', en: 'Filter' },
  'Экспорт в Excel': { ky: 'Excel ге экспорттоо', en: 'Export to Excel' },
  'Да': { ky: 'Ооба', en: 'Yes' },
  'Нет': { ky: 'Жок', en: 'No' },
  'Успешно': { ky: 'Ийгиликтүү', en: 'Success' },
  'сом': { ky: 'сом', en: 'som' },
  ' сом': { ky: ' сом', en: ' som' },
  "Нажмите 'Поделиться' -> 'На экран домой'": {
    ky: "'Бөлүшүү' -> 'Башкы экранга' басыңыз",
    en: "Press 'Share' -> 'Add to Home Screen'",
  },
  'Установить на устройство': { ky: 'Түзмөккө орнотуу', en: 'Install on device' },
  'Установить': { ky: 'Орнотуу', en: 'Install' },
  'Неизвестная ошибка сервера': { ky: 'Белгисиз сервердик ката', en: 'Unknown server error' },
  'Внутренняя ошибка сервера (500)': { ky: 'Ички сервердик ката (500)', en: 'Internal server error (500)' },
  'Ошибка валидации данных': { ky: 'Маалыматтарды текшерүү катасы', en: 'Data validation error' },
  'Товар не найден на сервере': { ky: 'Товар серверде табылган жок', en: 'Product not found on server' },
  'Ошибка авторизации (токен недействителен)': { ky: 'Авторизация катасы (токен жараксыз)', en: 'Authorization error (invalid token)' },
  'Нет прав доступа. Данные не синхронизированы.': { ky: 'Кирүү укугу жок. Маалыматтар синхрондоштурулган эмес.', en: 'Access denied. Data not synchronized.' },
  'Нет сети. Товар сохранён локально и будет отправлен позже.': { ky: 'Интернет жок. Товар локалдуу сакталды жана кийинчерээк жөнөтүлөт.', en: 'No network. Product saved locally and will be sent later.' },
  'Нет сети. Изменения сохранены локально.': { ky: 'Интернет жок. Өзгөртүүлөр локалдуу сакталды.', en: 'No network. Changes saved locally.' },
  'Нет сети. Удаление сохранено локально.': { ky: 'Интернет жок. Өчүрүү локалдуу сакталды.', en: 'No network. Deletion saved locally.' },
  'Ошибка сервера': { ky: 'Сервердик ката', en: 'Server error' },
  'Товар со штрих-кодом «{{barcode}}» уже существует: «{{name}}»': { ky: '«{{barcode}}» штрих-коду бар товар мурунтан эле бар: «{{name}}»', en: 'Product with barcode "{{barcode}}" already exists: "{{name}}"' },
  'Товар с ID {{id}} уже существует': { ky: '{{id}} IDси бар товар мурунтан эле бар', en: 'Product with ID {{id}} already exists' },
  'Недостаточно товара «{{productName}}» на складе. Доступно: {{available}} шт., требуется: {{required}} шт.': { ky: 'Кампада «{{productName}}» товары жетишсиз. Бар: {{available}} даана, талап кылынат: {{required}} даана.', en: 'Insufficient stock for "{{productName}}". Available: {{available}} pcs, required: {{required}} pcs.' },
  'Заказано водителем: {{boxes}} кор. ({{pieces}} шт.)': {
    ky: 'Айдоочу буюртма берген: {{boxes}} куту ({{pieces}} даана)',
    en: 'Ordered by driver: {{boxes}} boxes ({{pieces}} pcs)',
  },
  'На складе: {{boxes}} кор.': {
    ky: 'Кампада: {{boxes}} куту',
    en: 'In stock: {{boxes}} boxes',
  },
  'На складе: {{boxes}} кор. (не хватает {{deficit}} кор.)': {
    ky: 'Кампада: {{boxes}} куту ({{deficit}} куту жетпейт)',
    en: 'In stock: {{boxes}} boxes (shortage {{deficit}} boxes)',
  },
  'не хватает {{deficit}} кор.': {
    ky: '{{deficit}} куту жетпейт',
    en: 'shortage {{deficit}} boxes',
  },
  '{{name}}: нужно {{need}} кор., в наличии {{have}} кор.': {
    ky: '{{name}}: {{need}} куту керек, кампада {{have}} куту бар',
    en: '{{name}}: need {{need}} boxes, have {{have}} boxes',
  },
};

function translateRuToKy(ruText) {
  if (!ruText || typeof ruText !== 'string') return ruText;
  if (TRANSLATION_MAP[ruText]?.ky) return TRANSLATION_MAP[ruText].ky;
  return ruText;
}

function translateRuToEn(ruText) {
  if (!ruText || typeof ruText !== 'string') return ruText;
  if (TRANSLATION_MAP[ruText]?.en) return TRANSLATION_MAP[ruText].en;
  return ruText;
}

console.log('=== 1. Extracting t(...) Keys from Source Code ===');

function scanSourceFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules' && entry.name !== 'i18n') {
        results.push(...scanSourceFiles(fullPath));
      }
    } else if (
      (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

const sourceFiles = scanSourceFiles(SRC_DIR);
const extractedKeys = new Map();

// Regex patterns for t('key', 'default') and t('key', { defaultValue: 'default' })
const tRegex1 = /t\(\s*['"]([a-zA-Z0-9_.-]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
const tRegex2 = /t\(\s*['"]([a-zA-Z0-9_.-]+)['"]\s*,\s*\{\s*[^}]*defaultValue:\s*['"]([^'"]+)['"]/g;
const tRegex3 = /t\(\s*['"]([a-zA-Z0-9_.-]+)['"]\s*,\s*\{\s*[^}]*defaultValue:\s*`([^`]+)`/g;

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = tRegex1.exec(content)) !== null) {
    extractedKeys.set(match[1], match[2]);
  }
  while ((match = tRegex2.exec(content)) !== null) {
    extractedKeys.set(match[1], match[2]);
  }
  while ((match = tRegex3.exec(content)) !== null) {
    extractedKeys.set(match[1], match[2]);
  }
}

console.log(`Extracted ${extractedKeys.size} t(...) keys from source code.`);

console.log('=== 2. Reading & Synchronizing Locale Files ===');
const ruJson = JSON.parse(fs.readFileSync(RU_PATH, 'utf8'));
const kyJson = JSON.parse(fs.readFileSync(KY_PATH, 'utf8'));
const enJson = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));

const ruFlat = flattenObject(ruJson);
const kyFlat = flattenObject(kyJson);
const enFlat = flattenObject(enJson);

// Add all extracted keys
for (const [key, defaultVal] of extractedKeys.entries()) {
  if (!ruFlat[key]) {
    ruFlat[key] = defaultVal;
  }
}

// Union of all keys across everything
const allKeys = Array.from(
  new Set([...Object.keys(ruFlat), ...Object.keys(kyFlat), ...Object.keys(enFlat), ...extractedKeys.keys()])
).sort();

console.log(`Total unique keys: ${allKeys.length}`);

// Synchronize all dictionaries
const synchedRu = {};
const synchedKy = {};
const synchedEn = {};

let filledKy = 0;
let filledEn = 0;
let filledRu = 0;

for (const key of allKeys) {
  const ruVal = ruFlat[key] || extractedKeys.get(key);
  const kyVal = kyFlat[key];
  const enVal = enFlat[key];

  const baseVal = ruVal || kyVal || enVal || key;

  synchedRu[key] = ruVal ?? baseVal;
  if (!ruFlat[key]) filledRu++;

  if (kyVal) {
    synchedKy[key] = kyVal;
  } else {
    synchedKy[key] = translateRuToKy(baseVal);
    filledKy++;
  }

  if (enVal) {
    synchedEn[key] = enVal;
  } else {
    synchedEn[key] = translateRuToEn(baseVal);
    filledEn++;
  }
}

console.log(`Filled missing: RU=${filledRu}, KY=${filledKy}, EN=${filledEn}`);

// Write back synchronized JSONs with identical structure and ordering
fs.writeFileSync(RU_PATH, JSON.stringify(unflattenObject(synchedRu), null, 2) + '\n', 'utf8');
fs.writeFileSync(KY_PATH, JSON.stringify(unflattenObject(synchedKy), null, 2) + '\n', 'utf8');
fs.writeFileSync(EN_PATH, JSON.stringify(unflattenObject(synchedEn), null, 2) + '\n', 'utf8');

console.log('=== 3. Key Parity Verification ===');
console.log(`Final Key Count: RU=${Object.keys(synchedRu).length}, KY=${Object.keys(synchedKy).length}, EN=${Object.keys(synchedEn).length}`);

const missingInKy = Object.keys(synchedRu).filter((k) => !synchedKy[k]);
const missingInEn = Object.keys(synchedRu).filter((k) => !synchedEn[k]);
const missingInRu = Object.keys(synchedKy).filter((k) => !synchedRu[k]);

if (missingInKy.length === 0 && missingInEn.length === 0 && missingInRu.length === 0) {
  console.log('✅ ALL LOCALE DICTIONARIES ARE 100% SYNCHRONIZED AND IN PARITY!');
} else {
  console.error('❌ Parity mismatch found:', { missingInKy, missingInEn, missingInRu });
  process.exit(1);
}
