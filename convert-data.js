const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const NFL_DIVISIONS = {
    'Arizona Cardinals': 'NFC West',
    'Atlanta Falcons': 'NFC South',
    'Baltimore Ravens': 'AFC North',
    'Buffalo Bills': 'AFC East',
    'Carolina Panthers': 'NFC South',
    'Chicago Bears': 'NFC North',
    'Cincinnati Bengals': 'AFC North',
    'Cleveland Browns': 'AFC North',
    'Dallas Cowboys': 'NFC East',
    'Denver Broncos': 'AFC West',
    'Detroit Lions': 'NFC North',
    'Green Bay Packers': 'NFC North',
    'Houston Texans': 'AFC South',
    'Indianapolis Colts': 'AFC South',
    'Jacksonville Jaguars': 'AFC South',
    'Kansas City Chiefs': 'AFC West',
    'Las Vegas Raiders': 'AFC West',
    'Los Angeles Chargers': 'AFC West',
    'Los Angeles Rams': 'NFC West',
    'Miami Dolphins': 'AFC East',
    'Minnesota Vikings': 'NFC North',
    'New England Patriots': 'AFC East',
    'New Orleans Saints': 'NFC South',
    'New York Giants': 'NFC East',
    'New York Jets': 'AFC East',
    'Philadelphia Eagles': 'NFC East',
    'Pittsburgh Steelers': 'AFC North',
    'San Francisco 49ers': 'NFC West',
    'Seattle Seahawks': 'NFC West',
    'Tampa Bay Buccaneers': 'NFC South',
    'Tennessee Titans': 'AFC South',
    'Washington Commanders': 'NFC East'
};

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

// NFL conversion
convertNFLWorkbook();

console.log('\n🚀 Ready for deployment!');
console.log('Next steps:');
console.log('1. Copy the updated index.html file');
console.log('2. Initialize git repository: git init');
console.log('3. Add files: git add .');
console.log('4. Commit: git commit -m "Deploy NCAAF Dashboard"');
console.log('5. Push to GitHub and enable Pages');
console.log('\nYour dashboard will be live shortly after deployment! 🎉');

function convertNFLWorkbook() {
    const nflFile = 'nfl.xlsx';
    if (!fs.existsSync(nflFile)) {
        console.log('\n🏟️ NFL workbook not found – skipping NFL conversion.');
        return;
    }

    console.log('\n🏟️ Processing NFL workbook...');
    let workbook;
    try {
        workbook = XLSX.readFile(nflFile, { cellDates: true });
    } catch (error) {
        console.error('❌ Failed to read nfl.xlsx:', error.message);
        return;
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        console.error('❌ NFL workbook has no sheets.');
        return;
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    console.log(`📝 Found ${rows.length} NFL rows`);

    const normalized = normalizeNFLRows(rows);
    if (!normalized.length) {
        console.warn('⚠️ No NFL games could be normalized.');
        return;
    }

    const nflOutput = path.join(dataDir, 'nfl-games.json');
    fs.writeFileSync(nflOutput, JSON.stringify(normalized, null, 1));
    console.log(`✅ Wrote ${normalized.length} NFL games → ${nflOutput}`);
    console.log(`   File size: ${(fs.statSync(nflOutput).size / 1024 / 1024).toFixed(2)} MB`);

    const seasons = [...new Set(normalized.map(game => game.Season))].filter(Boolean).sort((a, b) => a - b);
    if (normalized.length > 1000) {
        console.log('\n📂 Creating season-specific NFL files...');
        seasons.forEach(season => {
            const chunk = normalized.filter(game => game.Season === season);
            const seasonFile = path.join(dataDir, `nfl-season-${season}.json`);
            fs.writeFileSync(seasonFile, JSON.stringify(chunk, null, 1));
            console.log(`   Season ${season}: ${chunk.length} games → ${seasonFile}`);
        });
    }

    console.log('\n🏟️ NFL Data Summary:');
    console.log(`   Seasons: ${seasons.join(', ')}`);
    const divisions = [...new Set(normalized.flatMap(g => [g.HomeConference, g.AwayConference]).filter(Boolean))].sort();
    console.log(`   Divisions: ${divisions.length}`);
}

function normalizeNFLRows(rows) {
    const preprocessed = [];

    rows.forEach(row => {
        const dateValue = row['Date'];
        const date = dateValue instanceof Date ? dateValue : parseDate(dateValue);
        const home = cleanString(row['Home Team']);
        const away = cleanString(row['Away Team']);
        if (!date || !home || !away) return;

        const season = deriveNFLSeason(date);
        const weekKey = resolveWeekKey(date);

        preprocessed.push({ row, date, season, weekKey });
    });

    // Assign sequential week numbers per season
    const weekLookup = new Map();
    const seasonWeekMap = new Map();

    for (const { season, weekKey } of preprocessed) {
        if (!seasonWeekMap.has(season)) {
            seasonWeekMap.set(season, new Set());
        }
        seasonWeekMap.get(season).add(weekKey);
    }

    seasonWeekMap.forEach((weeks, season) => {
        const sorted = Array.from(weeks).sort();
        sorted.forEach((weekKey, index) => {
            weekLookup.set(`${season}|${weekKey}`, index + 1);
        });
    });

    return preprocessed.map(({ row, date, season, weekKey }) => {
        const week = weekLookup.get(`${season}|${weekKey}`) ?? null;
        const homeTeam = cleanString(row['Home Team']);
        const awayTeam = cleanString(row['Away Team']);

        const homeScore = toNumber(row['Home Score']);
        const awayScore = toNumber(row['Away Score']);
        const homeLineOpen = toNumber(row['Home Line Open']);
        const homeLineMin = toNumber(row['Home Line Min']);
        const homeLineMax = toNumber(row['Home Line Max']);
        const homeLineClose = toNumber(row['Home Line Close']);

        const awayLineOpen = toNumber(row['Away Line Open']);
        const awayLineMin = toNumber(row['Away Line Min']);
        const awayLineMax = toNumber(row['Away Line Max']);
        const awayLineClose = toNumber(row['Away Line Close']);

        const totalOpen = toNumber(row['Total Score Open']);
        const totalMin = toNumber(row['Total Score Min']);
        const totalMax = toNumber(row['Total Score Max']);
        const totalClose = toNumber(row['Total Score Close']);

        const homeOddsOpen = decimalToAmerican(row['Home Odds Open']);
        const homeOddsMin = decimalToAmerican(row['Home Odds Min']);
        const homeOddsMax = decimalToAmerican(row['Home Odds Max']);
        const homeOddsClose = decimalToAmerican(row['Home Odds Close']);

        const awayOddsOpen = decimalToAmerican(row['Away Odds Open']);
        const awayOddsMin = decimalToAmerican(row['Away Odds Min']);
        const awayOddsMax = decimalToAmerican(row['Away Odds Max']);
        const awayOddsClose = decimalToAmerican(row['Away Odds Close']);

        const homeLineOddsOpen = decimalToAmerican(row['Home Line Odds Open']);
        const homeLineOddsMin = decimalToAmerican(row['Home Line Odds Min']);
        const homeLineOddsMax = decimalToAmerican(row['Home Line Odds Max']);
        const homeLineOddsClose = decimalToAmerican(row['Home Line Odds Close']);

        const awayLineOddsOpen = decimalToAmerican(row['Away Line Odds Open']);
        const awayLineOddsMin = decimalToAmerican(row['Away Line Odds Min']);
        const awayLineOddsMax = decimalToAmerican(row['Away Line Odds Max']);
        const awayLineOddsClose = decimalToAmerican(row['Away Line Odds Close']);

        const totalOverOpen = decimalToAmerican(row['Total Score Over Open']);
        const totalOverMin = decimalToAmerican(row['Total Score Over Min']);
        const totalOverMax = decimalToAmerican(row['Total Score Over Max']);
        const totalOverClose = decimalToAmerican(row['Total Score Over Close']);

        const totalUnderOpen = decimalToAmerican(row['Total Score Under Open']);
        const totalUnderMin = decimalToAmerican(row['Total Score Under Min']);
        const totalUnderMax = decimalToAmerican(row['Total Score Under Max']);
        const totalUnderClose = decimalToAmerican(row['Total Score Under Close']);

        const id = row.Id
            || `${season}-${String(week || '').padStart(2, '0')}-${slugify(homeTeam)}-${slugify(awayTeam)}-${date.toISOString().slice(0, 10)}`;

        const homeDivision = NFL_DIVISIONS[homeTeam] || null;
        const awayDivision = NFL_DIVISIONS[awayTeam] || null;

        return {
            Id: id,
            Season: season,
            Week: week,
            StartDate: date.toISOString(),
            HomeTeam_x: homeTeam,
            AwayTeam_x: awayTeam,
            HomeConference: homeDivision,
            AwayConference: awayDivision,
            HomeScore: homeScore,
            AwayScore: awayScore,
            Spread: homeLineClose,
            OverUnder: totalClose,
            OpeningSpread: homeLineOpen,
            OpeningOverUnder: totalOpen,
            HomeMoneyline: homeOddsClose,
            AwayMoneyline: awayOddsClose,
            SeasonType: toBoolean(row['Playoff Game?']) ? 'Postseason' : 'Regular',
            Completed: Number.isFinite(homeScore) && Number.isFinite(awayScore),
            LineProvider: 'Consensus',
            NeutralVenue: toBoolean(row['Neutral Venue?']) || null,
            PlayoffGame: toBoolean(row['Playoff Game?']) || null,
            Notes: cleanString(row['Notes']) || null,
            HomeMoneylineOpen: homeOddsOpen,
            HomeMoneylineMin: homeOddsMin,
            HomeMoneylineMax: homeOddsMax,
            HomeMoneylineClose: homeOddsClose,
            AwayMoneylineOpen: awayOddsOpen,
            AwayMoneylineMin: awayOddsMin,
            AwayMoneylineMax: awayOddsMax,
            AwayMoneylineClose: awayOddsClose,
            HomeLineOpen: homeLineOpen,
            HomeLineMin: homeLineMin,
            HomeLineMax: homeLineMax,
            HomeLineClose: homeLineClose,
            AwayLineOpen: awayLineOpen,
            AwayLineMin: awayLineMin,
            AwayLineMax: awayLineMax,
            AwayLineClose: awayLineClose,
            HomeLineOddsOpen: homeLineOddsOpen,
            HomeLineOddsMin: homeLineOddsMin,
            HomeLineOddsMax: homeLineOddsMax,
            HomeLineOddsClose: homeLineOddsClose,
            AwayLineOddsOpen: awayLineOddsOpen,
            AwayLineOddsMin: awayLineOddsMin,
            AwayLineOddsMax: awayLineOddsMax,
            AwayLineOddsClose: awayLineOddsClose,
            TotalScoreOpen: totalOpen,
            TotalScoreMin: totalMin,
            TotalScoreMax: totalMax,
            TotalScoreClose: totalClose,
            TotalScoreOverOpen: totalOverOpen,
            TotalScoreOverMin: totalOverMin,
            TotalScoreOverMax: totalOverMax,
            TotalScoreOverClose: totalOverClose,
            TotalScoreUnderOpen: totalUnderOpen,
            TotalScoreUnderMin: totalUnderMin,
            TotalScoreUnderMax: totalUnderMax,
            TotalScoreUnderClose: totalUnderClose
        };
    });
}

function parseDate(value) {
    if (!value) return null;
    if (typeof value === 'number' && XLSX.SSF?.parse_date_code) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
        }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function toBoolean(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const str = String(value).trim().toLowerCase();
    return ['y', 'yes', 'true', 't', '1'].includes(str);
}

function decimalToAmerican(decimal) {
    const num = toNumber(decimal);
    if (!Number.isFinite(num) || num <= 1) return null;
    if (num >= 2) {
        return Math.round((num - 1) * 100);
    }
    return -Math.round(100 / (num - 1));
}

function deriveNFLSeason(date) {
    const month = date.getUTCMonth();
    const year = date.getUTCFullYear();
    return month < 3 ? year - 1 : year;
}

function resolveWeekKey(date) {
    const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = copy.getUTCDay();
    const diff = (day + 6) % 7; // shift so Monday is start
    copy.setUTCDate(copy.getUTCDate() - diff);
    return copy.toISOString().slice(0, 10);
}

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function cleanString(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str.length ? str : null;
}
