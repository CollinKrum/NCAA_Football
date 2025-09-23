const fs = require('fs');
const path = require('path');

console.log('🏈 NCAAF Data Conversion Script');
console.log('================================');

// Check if CSV file exists
const csvFile = 'master_NCAAF_GamesWithOdds_Long.csv';
if (!fs.existsSync(csvFile)) {
    console.error('❌ CSV file not found:', csvFile);
    console.log('Make sure the CSV file is in the same directory as this script.');
    process.exit(1);
}

// Create data directory
const dataDir = 'data';
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
    console.log('📁 Created data directory');
}

console.log('📊 Reading CSV file...');
const csvData = fs.readFileSync(csvFile, 'utf8');
const lines = csvData.split('\n');
const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

console.log('📝 Found', lines.length - 1, 'data rows');
console.log('🏷️ Headers:', headers.slice(0, 8).join(', '), '...');

const jsonData = [];
let processedRows = 0;

for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = [];
    let current = '';
    let inQuotes = false;
    
    // Parse CSV line with proper quote handling
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
    // Add the last value
    values.push(parseValue(current.trim().replace(/"/g, '')));
    
    // Create row object
    const row = {};
    headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index] : null;
    });
    
    // Only add rows with essential data
    if (row.Id && (row.HomeTeam_x || row.HomeTeam_y)) {
        jsonData.push(row);
        processedRows++;
    }
    
    // Progress indicator
    if (i % 1000 === 0) {
        console.log(`⏳ Processed ${i}/${lines.length - 1} rows...`);
    }
}

function parseValue(value) {
    if (value === '' || value === 'null' || value === 'NULL' || value === 'undefined') {
        return null;
    }
    if (value === 'True' || value === 'true') return true;
    if (value === 'False' || value === 'false') return false;
    
    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && value !== '' && value !== null) {
        return num;
    }
    
    return value;
}

// Write main JSON file
const outputFile = path.join(dataDir, 'ncaaf-games.json');
fs.writeFileSync(outputFile, JSON.stringify(jsonData, null, 1));

console.log('✅ Conversion completed successfully!');
console.log('📈 Statistics:');
console.log(`   Total rows processed: ${processedRows}`);
console.log(`   Output file: ${outputFile}`);
console.log(`   File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);

// Generate summary statistics
const seasons = [...new Set(jsonData.map(row => row.Season))].filter(s => s).sort();
const providers = [...new Set(jsonData.map(row => row.LineProvider))].filter(p => p);
const conferences = [...new Set(jsonData.map(row => row.HomeConference))].filter(c => c);

console.log('\n📊 Data Summary:');
console.log(`   Seasons: ${seasons.join(', ')}`);
console.log(`   Sportsbooks: ${providers.length} (${providers.slice(0, 3).join(', ')}${providers.length > 3 ? '...' : ''})`);
console.log(`   Conferences: ${conferences.length} (${conferences.slice(0, 3).join(', ')}${conferences.length > 3 ? '...' : ''})`);

// Check data quality
const withSpreads = jsonData.filter(row => row.Spread != null).length;
const withTotals = jsonData.filter(row => row.OverUnder != null).length;
const withScores = jsonData.filter(row => row.HomeScore != null && row.AwayScore != null).length;

console.log('\n🎯 Data Quality:');
console.log(`   Games with spreads: ${withSpreads} (${(withSpreads/jsonData.length*100).toFixed(1)}%)`);
console.log(`   Games with totals: ${withTotals} (${(withTotals/jsonData.length*100).toFixed(1)}%)`);
console.log(`   Games with scores: ${withScores} (${(withScores/jsonData.length*100).toFixed(1)}%)`);

// Optional: Create season-specific files for better performance
if (jsonData.length > 10000) {
    console.log('\n📂 Creating season-specific files for better performance...');
    
    seasons.forEach(season => {
        const seasonData = jsonData.filter(game => game.Season == season);
        const seasonFile = path.join(dataDir, `season-${season}.json`);
        fs.writeFileSync(seasonFile, JSON.stringify(seasonData, null, 1));
        console.log(`   Season ${season}: ${seasonData.length} games → ${seasonFile}`);
    });
}

console.log('\n🚀 Ready for deployment!');
console.log('Next steps:');
console.log('1. Copy the updated index.html file');
console.log('2. Initialize git repository: git init');
console.log('3. Add files: git add .');
console.log('4. Commit: git commit -m "Deploy NCAAF Dashboard"');
console.log('5. Push to GitHub and enable Pages');
console.log('\nYour dashboard will be live shortly after deployment! 🎉');
