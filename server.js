const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve your HTML files from 'public' folder

// In-memory cache for games data
let gamesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Load games from JSON
async function loadGamesFromJSON() {
  try {
    const jsonPath = path.join(__dirname, 'data/ncaaf-games.json');
    
    if (!fs.existsSync(jsonPath)) {
      console.log('JSON file not found, using demo data...');
      return generateDemoData();
    }

    console.log('📂 Reading JSON file...');
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    console.log('📊 Parsing JSON data...');
    const rawGames = JSON.parse(rawData);
    
    // Map the fields to match what the API expects
    const games = rawGames.map(game => ({
      id: game.Id,
      season: game.Season,
      week: game.Week,
      startDate: game.StartDate,
      homeTeam: game.HomeTeam_x,
      awayTeam: game.AwayTeam_x,
      homeConference: game.HomeConference,
      awayConference: game.AwayConference,
      homeScore: game.HomeScore,
      awayScore: game.AwayScore,
      spread: game.Spread,
      overUnder: game.OverUnder,
      openingSpread: game.OpeningSpread,
      openingOverUnder: game.OpeningOverUnder,
      homeMoneyline: game.HomeMoneyline,
      awayMoneyline: game.AwayMoneyline,
      seasonType: game.SeasonType,
      completed: game.Completed,
      lineProvider: game.LineProvider
    }));
    
    console.log(`✅ Loaded ${games.length} games from JSON file`);
    return games;
  } catch (error) {
    console.error('❌ Error reading JSON:', error.message);
    console.log('🔄 Falling back to demo data');
    return generateDemoData();
  }
}
// Generate demo data if CSV not available
function generateDemoData() {
  const seasons = [2021, 2022, 2023, 2024];
  const conferences = ['SEC', 'Big Ten', 'Big 12', 'Pac-12', 'ACC'];
  const teams = {
    'SEC': ['Alabama', 'Georgia', 'LSU', 'Florida', 'Auburn', 'Tennessee'],
    'Big Ten': ['Ohio State', 'Michigan', 'Penn State', 'Wisconsin', 'Iowa'],
    'Big 12': ['Oklahoma', 'Texas', 'Oklahoma State', 'Baylor', 'TCU'],
    'Pac-12': ['USC', 'Oregon', 'Washington', 'Stanford', 'UCLA'],
    'ACC': ['Clemson', 'Miami', 'Virginia Tech', 'North Carolina', 'Duke']
  };
  const providers = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars'];
  
  const games = [];
  let gameId = 1;

  for (let season of seasons) {
    for (let week = 1; week <= 15; week++) {
      for (let conf of conferences) {
        const confTeams = teams[conf];
        const gamesThisWeek = Math.floor(Math.random() * 2) + 1;
        
        for (let g = 0; g < gamesThisWeek; g++) {
          const homeTeam = confTeams[Math.floor(Math.random() * confTeams.length)];
          let awayTeam = confTeams[Math.floor(Math.random() * confTeams.length)];
          while (awayTeam === homeTeam) {
            awayTeam = confTeams[Math.floor(Math.random() * confTeams.length)];
          }

          const spread = parseFloat((Math.random() * 28 - 14).toFixed(1));
          const total = parseFloat((Math.random() * 40 + 40).toFixed(1));
          const homeScore = Math.floor(Math.random() * 35 + 10);
          const awayScore = Math.floor(Math.random() * 35 + 10);
          const openingSpread = parseFloat((spread + (Math.random() * 4 - 2)).toFixed(1));
          const openingTotal = parseFloat((total + (Math.random() * 4 - 2)).toFixed(1));
          const homeFavored = spread < 0;
          const favOdds = -Math.max(110, Math.floor(Math.random() * 200) + 120);
          const dogOdds = Math.max(110, Math.floor(Math.random() * 250) + 110);
          const homeMoneyline = homeFavored ? favOdds : dogOdds;
          const awayMoneyline = homeFavored ? dogOdds : favOdds;
          
          games.push({
            id: gameId++,
            season: season,
            week: week,
            startDate: new Date(season, 8 + Math.floor(week/4), (week % 4) * 7).toISOString(),
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            homeConference: conf,
            awayConference: conf,
            homeScore: homeScore,
            awayScore: awayScore,
            spread: spread,
            overUnder: total,
            openingSpread: openingSpread,
            openingOverUnder: openingTotal,
            homeMoneyline: homeMoneyline,
            awayMoneyline: awayMoneyline,
            seasonType: 'Regular',
            completed: true,
            lineProvider: providers[Math.floor(Math.random() * providers.length)]
          });
        }
      }
    }
  }
  
  console.log(`🎲 Generated ${games.length} demo games`);
  return games;
}

// Get cached games or load fresh data
async function getGamesData() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (gamesCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return gamesCache;
  }
  
  // Load fresh data
  try {
    gamesCache = await loadGamesFromJSON();
    cacheTimestamp = now;
    return gamesCache;
  } catch (error) {
    console.error('Error loading games data:', error);
  }
}
// API Routes
app.get('/api/games', async (req, res) => {
  try {
    const { season, week, team, conference, limit } = req.query;
    let games = await getGamesData();
    
    // Apply filters
    if (season) {
      games = games.filter(g => g.season == season);
    }
    if (week) {
      games = games.filter(g => g.week == week);
    }
    if (team) {
      games = games.filter(g => 
        g.homeTeam?.toLowerCase().includes(team.toLowerCase()) || 
        g.awayTeam?.toLowerCase().includes(team.toLowerCase())
      );
    }
    if (conference) {
      games = games.filter(g => 
        g.homeConference?.toLowerCase().includes(conference.toLowerCase()) ||
        g.awayConference?.toLowerCase().includes(conference.toLowerCase())
      );
    }
    if (limit) {
      games = games.slice(0, parseInt(limit));
    }

    res.json({
      success: true,
      count: games.length,
      data: games,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /api/games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games data'
    });
  }
});

// Get summary statistics
app.get('/api/stats', async (req, res) => {
  try {
    const games = await getGamesData();
    
    const stats = {
      totalGames: games.length,
      seasons: [...new Set(games.map(g => g.season))].filter(Boolean).sort(),
      conferences: [...new Set([...games.map(g => g.homeConference), ...games.map(g => g.awayConference)])].filter(Boolean),
      sportsbooks: [...new Set(games.map(g => g.lineProvider))].filter(Boolean),
      spreadCoverage: ((games.filter(g => g.spread !== null).length / games.length) * 100).toFixed(1),
      totalsCoverage: ((games.filter(g => g.overUnder !== null).length / games.length) * 100).toFixed(1),
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error in /api/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate stats'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'NCAAF API Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve the main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🏈 NCAAF Dashboard Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints:`);
  console.log(`   GET /api/games - Get games data`);
  console.log(`   GET /api/stats - Get summary statistics`);
  console.log(`   GET /api/health - Health check`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});
