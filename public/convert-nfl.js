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
  const toNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const decimalToAmerican = value => {
    const num = toNumber(value);
    if (!Number.isFinite(num) || num <= 1) return null;
    if (num >= 2) {
      return Math.round((num - 1) * 100);
    }
    return -Math.round(100 / (num - 1));
  };
  const pickLine = (...names) => toNumber(mapField(...names));
  const pickOdds = (...names) => decimalToAmerican(mapField(...names));

  const homeMoneylineClose = pickOdds('HomeMoneyline', 'homeMoneyline', 'Home Odds Close');
  const awayMoneylineClose = pickOdds('AwayMoneyline', 'awayMoneyline', 'Away Odds Close');

  return {
    Id: mapField('Id', 'id', 'ID'),
    Season: mapField('Season', 'season', 'YEAR'),
    Week: mapField('Week', 'week', 'WEEK'),
    StartDate: mapField('StartDate', 'startDate', 'DATE'),
    HomeTeam: mapField('HomeTeam', 'homeTeam', 'Home Team'),
    AwayTeam: mapField('AwayTeam', 'awayTeam', 'Away Team'),
    HomeConference: mapField('HomeConference', 'homeConference', 'HomeConf', 'Home Conference'),
    AwayConference: mapField('AwayConference', 'awayConference', 'AwayConf', 'Away Conference'),
    HomeScore: pickLine('HomeScore', 'homeScore', 'Home Score'),
    AwayScore: pickLine('AwayScore', 'awayScore', 'Away Score'),
    Spread: pickLine('Spread', 'spread', 'Line', 'Home Line Close'),
    OverUnder: pickLine('OverUnder', 'overUnder', 'Total', 'Total Score Close'),
    OpeningSpread: pickLine('OpeningSpread', 'openingSpread', 'OpenLine', 'Home Line Open'),
    OpeningOverUnder: pickLine('OpeningOverUnder', 'openingOverUnder', 'OpenTotal', 'Total Score Open'),
    HomeMoneyline: homeMoneylineClose,
    AwayMoneyline: awayMoneylineClose,
    NeutralVenue: mapField('NeutralVenue', 'neutralVenue', 'Neutral'),
    PlayoffGame: mapField('PlayoffGame', 'playoffGame', 'Playoff'),
    Notes: mapField('Notes', 'notes', 'Comment'),
    LineProvider: mapField('LineProvider', 'lineProvider', 'Book', 'Sportsbook'),
    HomeMoneylineOpen: pickOdds('HomeMoneylineOpen', 'homeMoneylineOpen', 'Home Odds Open'),
    HomeMoneylineMin: pickOdds('HomeMoneylineMin', 'homeMoneylineMin', 'Home Odds Min'),
    HomeMoneylineMax: pickOdds('HomeMoneylineMax', 'homeMoneylineMax', 'Home Odds Max'),
    HomeMoneylineClose: homeMoneylineClose,
    AwayMoneylineOpen: pickOdds('AwayMoneylineOpen', 'awayMoneylineOpen', 'Away Odds Open'),
    AwayMoneylineMin: pickOdds('AwayMoneylineMin', 'awayMoneylineMin', 'Away Odds Min'),
    AwayMoneylineMax: pickOdds('AwayMoneylineMax', 'awayMoneylineMax', 'Away Odds Max'),
    AwayMoneylineClose: awayMoneylineClose,
    HomeLineOpen: pickLine('HomeLineOpen', 'homeLineOpen', 'Home Line Open'),
    HomeLineMin: pickLine('HomeLineMin', 'homeLineMin', 'Home Line Min'),
    HomeLineMax: pickLine('HomeLineMax', 'homeLineMax', 'Home Line Max'),
    HomeLineClose: pickLine('HomeLineClose', 'homeLineClose', 'Home Line Close'),
    AwayLineOpen: pickLine('AwayLineOpen', 'awayLineOpen', 'Away Line Open'),
    AwayLineMin: pickLine('AwayLineMin', 'awayLineMin', 'Away Line Min'),
    AwayLineMax: pickLine('AwayLineMax', 'awayLineMax', 'Away Line Max'),
    AwayLineClose: pickLine('AwayLineClose', 'awayLineClose', 'Away Line Close'),
    HomeLineOddsOpen: pickOdds('HomeLineOddsOpen', 'homeLineOddsOpen', 'Home Line Odds Open'),
    HomeLineOddsMin: pickOdds('HomeLineOddsMin', 'homeLineOddsMin', 'Home Line Odds Min'),
    HomeLineOddsMax: pickOdds('HomeLineOddsMax', 'homeLineOddsMax', 'Home Line Odds Max'),
    HomeLineOddsClose: pickOdds('HomeLineOddsClose', 'homeLineOddsClose', 'Home Line Odds Close'),
    AwayLineOddsOpen: pickOdds('AwayLineOddsOpen', 'awayLineOddsOpen', 'Away Line Odds Open'),
    AwayLineOddsMin: pickOdds('AwayLineOddsMin', 'awayLineOddsMin', 'Away Line Odds Min'),
    AwayLineOddsMax: pickOdds('AwayLineOddsMax', 'awayLineOddsMax', 'Away Line Odds Max'),
    AwayLineOddsClose: pickOdds('AwayLineOddsClose', 'awayLineOddsClose', 'Away Line Odds Close'),
    TotalScoreOpen: pickLine('TotalScoreOpen', 'totalScoreOpen', 'Total Score Open'),
    TotalScoreMin: pickLine('TotalScoreMin', 'totalScoreMin', 'Total Score Min'),
    TotalScoreMax: pickLine('TotalScoreMax', 'totalScoreMax', 'Total Score Max'),
    TotalScoreClose: pickLine('TotalScoreClose', 'totalScoreClose', 'Total Score Close'),
    TotalScoreOverOpen: pickOdds('TotalScoreOverOpen', 'totalScoreOverOpen', 'Total Score Over Open'),
    TotalScoreOverMin: pickOdds('TotalScoreOverMin', 'totalScoreOverMin', 'Total Score Over Min'),
    TotalScoreOverMax: pickOdds('TotalScoreOverMax', 'totalScoreOverMax', 'Total Score Over Max'),
    TotalScoreOverClose: pickOdds('TotalScoreOverClose', 'totalScoreOverClose', 'Total Score Over Close'),
    TotalScoreUnderOpen: pickOdds('TotalScoreUnderOpen', 'totalScoreUnderOpen', 'Total Score Under Open'),
    TotalScoreUnderMin: pickOdds('TotalScoreUnderMin', 'totalScoreUnderMin', 'Total Score Under Min'),
    TotalScoreUnderMax: pickOdds('TotalScoreUnderMax', 'totalScoreUnderMax', 'Total Score Under Max'),
    TotalScoreUnderClose: pickOdds('TotalScoreUnderClose', 'totalScoreUnderClose', 'Total Score Under Close')
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
