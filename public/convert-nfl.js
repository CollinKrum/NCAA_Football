/*
 * Script to convert an NFL Excel workbook into JSON for the betting dashboard.
 *
 * Usage:
 *   node convert-nfl.js
 *
 * This script reads an Excel file named `NFL.xlsx` from the current
 * directory, converts each row into a plain JavaScript object using the
 * `xlsx` library, normalizes key names, and writes the output to
 * `data/nfl-games.json`. You may need to adjust the mapping below if your
 * spreadsheet uses different column headers. Fields not present in your
 * source data will be set to null.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const INPUT_FILE = 'NFL.xlsx';
const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'nfl-games.json');

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

function parseRow(row) {
  // Normalize keys in the row. You can adjust these mappings to fit your
  // spreadsheet columns. The keys on the left correspond to the expected
  // JSON property names; the values correspond to possible column names.
  const mapField = (primary, ...aliases) => {
    for (const key of [primary, ...aliases]) {
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
        return row[key];
      }
    }
    return null;
  };
  return {
    Id: mapField('Id', 'id', 'ID'),
    Season: mapField('Season', 'season', 'YEAR'),
    Week: mapField('Week', 'week', 'WEEK'),
    StartDate: mapField('StartDate', 'startDate', 'DATE'),
    HomeTeam: mapField('HomeTeam', 'homeTeam', 'Home Team'),
    AwayTeam: mapField('AwayTeam', 'awayTeam', 'Away Team'),
    HomeConference: mapField('HomeConference', 'homeConference', 'HomeConf', 'Home Conference'),
    AwayConference: mapField('AwayConference', 'awayConference', 'AwayConf', 'Away Conference'),
    HomeScore: mapField('HomeScore', 'homeScore', 'HomeScoreFinal'),
    AwayScore: mapField('AwayScore', 'awayScore', 'AwayScoreFinal'),
    Spread: mapField('Spread', 'spread', 'Line'),
    OverUnder: mapField('OverUnder', 'overUnder', 'Total'),
    OpeningSpread: mapField('OpeningSpread', 'openingSpread', 'OpenLine'),
    OpeningOverUnder: mapField('OpeningOverUnder', 'openingOverUnder', 'OpenTotal'),
    HomeMoneyline: mapField('HomeMoneyline', 'homeMoneyline', 'HomeML'),
    AwayMoneyline: mapField('AwayMoneyline', 'awayMoneyline', 'AwayML'),
    NeutralVenue: mapField('NeutralVenue', 'neutralVenue', 'Neutral'),
    PlayoffGame: mapField('PlayoffGame', 'playoffGame', 'Playoff'),
    Notes: mapField('Notes', 'notes', 'Comment'),
    LineProvider: mapField('LineProvider', 'lineProvider', 'Book', 'Sportsbook')
  };
}

function main() {
  console.log('🏈 NFL Data Conversion Script');
  console.log('===============================');
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('❌ Excel file not found:', INPUT_FILE);
    console.log('Please ensure that NFL.xlsx exists in the current directory.');
    process.exit(1);
  }
  // Read workbook
  const workbook = XLSX.readFile(INPUT_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  console.log(`📖 Reading sheet: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`🔍 Found ${rows.length} rows in workbook`);
  // Convert each row
  const games = rows.map(parseRow).filter(r => r.Id !== null);
  console.log(`✅ Converted ${games.length} games`);
  ensureDirectory(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(games, null, 2));
  console.log(`💾 Saved NFL games to ${OUTPUT_FILE}`);
  console.log(`📦 File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
}

main();