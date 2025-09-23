const fs = require('fs');

console.log('🏈 Converting NCAAF data to JSON...');

// Read CSV file
const csvData = fs.readFileSync('master_NCAAF_GamesWithOdds_Long.csv', 'utf8');
const lines = csvData.split('\n');
const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

console.log('📊 Found', lines.length - 1, 'data rows');
console.log('📝 Headers:', headers.slice(0, 5), '...');

const jsonData = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const values = [];
  let current = '';
  let inQuotes = false;
  
  // Parse CSV line with quote handling
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(parseValue(current.trim().replace(/"/g, '')));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(parseValue(current.trim().replace(/"/g, '')));
  
  // Create row object
  const row = {};
  headers.forEach((header, index) => {
    row[header] = values[index] || null;
  });
  
  jsonData.push(row);
}

function parseValue(value) {
  if (value === '' || value === 'null' || value === 'NULL') return null;
  if (value === 'True' || value === 'true') return true;
  if (value === 'False' || value === 'false') return false;
  
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  
  return value;
}

// Write JSON file
fs.writeFileSync('data/ncaaf-games.json', JSON.stringify(jsonData, null, 1));
console.log('✅ Successfully converted', jsonData.length, 'games to JSON');
console.log('📁 Output: data/ncaaf-games.json');
