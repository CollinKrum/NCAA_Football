const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve your HTML files from 'public' folder

// In-memory cache for games data
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const DEFAULT_SPORT = 'ncaaf';

const SPORT_CONFIG = {
  ncaaf: {
    label: 'NCAAF',
    dataFile: path.join(__dirname, 'data/ncaaf-games.json'),
    mapper: mapNCAAFGame,
    demo: generateNCAAFDemoData
  },
  nfl: {
    label: 'NFL',
    dataFile: path.join(__dirname, 'data/nfl-games.json'),
    mapper: mapNFLGame,
    demo: generateNFLDemoData
  }
};

const gameCaches = Object.fromEntries(
  Object.keys(SPORT_CONFIG).map(sport => [sport, { data: null, timestamp: null }])
);

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

// Load games from JSON
async function loadGamesForSport(requestedSport) {
  const sport = resolveSportKey(requestedSport);
  const config = SPORT_CONFIG[sport];
  const { dataFile, mapper, demo, label } = config;

  try {
    if (!fs.existsSync(dataFile)) {
      console.log(`[${label}] JSON file not found, using demo data...`);
      return demo();
    }

    console.log(`📂 Reading ${label} JSON file...`);
    const rawData = fs.readFileSync(dataFile, 'utf8');
    console.log(`📊 Parsing ${label} JSON data...`);
    const rawGames = JSON.parse(rawData);

    const games = rawGames.map(mapper).filter(Boolean);
    console.log(`✅ Loaded ${games.length} ${label} games from JSON file`);
    return games;
  } catch (error) {
    console.error(`❌ Error reading ${label} JSON:`, error.message);
    console.log(`🔄 Falling back to ${label} demo data`);
    return demo();
  }
}
// Generate demo NCAAF data if JSON not available
function generateNCAAFDemoData() {
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
  
  console.log(`🎲 Generated ${games.length} ${SPORT_CONFIG.ncaaf.label} demo games`);
  return games;
}

function generateNFLDemoData() {
  const seasons = [2021, 2022, 2023, 2024];
  const providers = ['Consensus', 'DraftKings', 'FanDuel', 'Circa'];
  const allTeams = Object.keys(NFL_DIVISIONS);

  const games = [];
  let gameId = 1;

  for (const season of seasons) {
    for (let week = 1; week <= 18; week++) {
      const shuffled = shuffleArray(allTeams);
      for (let i = 0; i < shuffled.length; i += 2) {
        const homeTeam = shuffled[i];
        const awayTeam = shuffled[i + 1];
        if (!homeTeam || !awayTeam) continue;

        const homeDivision = NFL_DIVISIONS[homeTeam];
        const awayDivision = NFL_DIVISIONS[awayTeam];
        const date = new Date(Date.UTC(season, 8, 4 + (week - 1) * 7));

        const spread = parseFloat((Math.random() * 14 - 7).toFixed(1));
        const total = parseFloat((Math.random() * 20 + 38).toFixed(1));
        const homeScore = Math.floor(Math.random() * 28 + 10);
        const awayScore = Math.floor(Math.random() * 28 + 10);
        const openingSpread = parseFloat((spread + (Math.random() * 2 - 1)).toFixed(1));
        const openingTotal = parseFloat((total + (Math.random() * 2 - 1)).toFixed(1));
        const homeFavored = spread < 0;
        const favOdds = -Math.max(110, Math.floor(Math.random() * 200) + 110);
        const dogOdds = Math.max(110, Math.floor(Math.random() * 220) + 110);
        const homeMoneyline = homeFavored ? favOdds : dogOdds;
        const awayMoneyline = homeFavored ? dogOdds : favOdds;

        games.push({
          id: `NFL-${season}-${week}-${gameId++}`,
          season,
          week,
          startDate: date.toISOString(),
          homeTeam,
          awayTeam,
          homeConference: homeDivision,
          awayConference: awayDivision,
          homeScore,
          awayScore,
          spread,
          overUnder: total,
          openingSpread,
          openingOverUnder: openingTotal,
          homeMoneyline,
          awayMoneyline,
          seasonType: week > 18 ? 'Postseason' : 'Regular',
          completed: true,
          lineProvider: providers[Math.floor(Math.random() * providers.length)],
          neutralVenue: false,
          playoffGame: week > 18
        });
      }
    }
  }

  console.log(`🎲 Generated ${games.length} ${SPORT_CONFIG.nfl.label} demo games`);
  return games;
}

function shuffleArray(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function resolveSportKey(value) {
  const key = String(value || '').toLowerCase();
  return SPORT_CONFIG[key] ? key : DEFAULT_SPORT;
}

function mapNCAAFGame(game = {}) {
  const id = game.Id ?? game.id ?? null;
  const season = game.Season ?? game.season ?? null;
  const week = game.Week ?? game.week ?? null;
  const startDate = game.StartDate ?? game.startDate ?? null;
  const homeTeam = game.HomeTeam_x ?? game.HomeTeam ?? game.homeTeam ?? null;
  const awayTeam = game.AwayTeam_x ?? game.AwayTeam ?? game.awayTeam ?? null;
  const homeConference = game.HomeConference ?? game.homeConference ?? null;
  const awayConference = game.AwayConference ?? game.awayConference ?? null;
  const homeScore = toNumber(game.HomeScore ?? game.homeScore);
  const awayScore = toNumber(game.AwayScore ?? game.awayScore);
  const spread = toNumber(game.Spread ?? game.spread);
  const overUnder = toNumber(game.OverUnder ?? game.overUnder);
  const openingSpread = toNumber(game.OpeningSpread ?? game.openingSpread);
  const openingOverUnder = toNumber(game.OpeningOverUnder ?? game.openingOverUnder);
  const homeMoneyline = toNumber(game.HomeMoneyline ?? game.homeMoneyline);
  const awayMoneyline = toNumber(game.AwayMoneyline ?? game.awayMoneyline);
  const completed = typeof game.Completed === 'boolean'
    ? game.Completed
    : (Number.isFinite(homeScore) && Number.isFinite(awayScore));
  const lineProvider = game.LineProvider ?? game.lineProvider ?? null;
  const seasonType = game.SeasonType ?? game.seasonType ?? null;

  return {
    id,
    sport: 'ncaaf',
    season,
    week,
    startDate,
    homeTeam,
    awayTeam,
    homeConference,
    awayConference,
    homeScore,
    awayScore,
    spread,
    overUnder,
    openingSpread,
    openingOverUnder,
    homeMoneyline,
    awayMoneyline,
    seasonType,
    completed,
    lineProvider
  };
}

function pickNumericValue(game, key) {
  if (!key) return null;
  const variants = [key, key.charAt(0).toLowerCase() + key.slice(1)];
  for (const variant of variants) {
    if (Object.prototype.hasOwnProperty.call(game, variant)) {
      const num = toNumber(game[variant]);
      if (num !== null) {
        return num;
      }
    }
  }
  return null;
}

function mapOddsHistory(game, prefix) {
  return {
    open: pickNumericValue(game, `${prefix}Open`),
    min: pickNumericValue(game, `${prefix}Min`),
    max: pickNumericValue(game, `${prefix}Max`),
    close: pickNumericValue(game, `${prefix}Close`) ?? pickNumericValue(game, prefix)
  };
}

function mapLineHistory(game, prefix) {
  return {
    open: pickNumericValue(game, `${prefix}Open`),
    min: pickNumericValue(game, `${prefix}Min`),
    max: pickNumericValue(game, `${prefix}Max`),
    close: pickNumericValue(game, `${prefix}Close`) ?? pickNumericValue(game, prefix)
  };
}

function mapNFLGame(game = {}) {
  const base = mapNCAAFGame(game);
  const neutralVenue = game.NeutralVenue ?? game.neutralVenue ?? null;
  const playoffGame = typeof game.PlayoffGame === 'boolean'
    ? game.PlayoffGame
    : toBoolean(game.PlayoffGame ?? game.playoffGame);
  const notes = game.Notes ?? game.notes ?? null;

  return {
    ...base,
    sport: 'nfl',
    seasonType: base.seasonType || (playoffGame ? 'Postseason' : 'Regular'),
    lineProvider: base.lineProvider || 'Consensus',
    neutralVenue,
    playoffGame,
    notes,
    moneylineHistory: {
      home: mapOddsHistory(game, 'HomeMoneyline'),
      away: mapOddsHistory(game, 'AwayMoneyline')
    },
    spreadHistory: {
      home: mapLineHistory(game, 'HomeLine'),
      away: mapLineHistory(game, 'AwayLine')
    },
    spreadOddsHistory: {
      home: mapOddsHistory(game, 'HomeLineOdds'),
      away: mapOddsHistory(game, 'AwayLineOdds')
    },
    totalHistory: mapLineHistory(game, 'TotalScore'),
    totalOverOddsHistory: mapOddsHistory(game, 'TotalScoreOver'),
    totalUnderOddsHistory: mapOddsHistory(game, 'TotalScoreUnder')
  };
}

function toBoolean(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  return ['true', 't', 'yes', 'y', '1'].includes(normalized);
}

// Get cached games or load fresh data
async function getGamesData(requestedSport) {
  const sport = resolveSportKey(requestedSport);
  const cache = gameCaches[sport];
  const now = Date.now();

  if (cache.data && cache.timestamp && (now - cache.timestamp) < CACHE_DURATION) {
    return cache.data;
  }

  try {
    const games = await loadGamesForSport(sport);
    cache.data = games;
    cache.timestamp = now;
    return games;
  } catch (error) {
    console.error(`Error loading ${sport} games data:`, error);
    return cache.data || [];
  }
}
// API Routes
app.get('/api/games', async (req, res) => {
  try {
    const { season, week, team, conference, limit, sport: sportParam } = req.query;
    const sport = resolveSportKey(sportParam);
    let games = await getGamesData(sport);
    
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
      sport,
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
    const sport = resolveSportKey(req.query.sport);
    const games = await getGamesData(sport);

    const totalGames = games.length;
    const seasons = [...new Set(games.map(g => g.season))].filter(Boolean).sort((a, b) => Number(a) - Number(b));
    const conferences = [...new Set([...games.map(g => g.homeConference), ...games.map(g => g.awayConference)])].filter(Boolean).sort();
    const sportsbooks = [...new Set(games.map(g => g.lineProvider).filter(Boolean))].sort();
    const spreadCount = games.filter(g => g.spread !== null && g.spread !== undefined).length;
    const totalCount = games.filter(g => g.overUnder !== null && g.overUnder !== undefined).length;

    const stats = {
      sport,
      totalGames,
      seasons,
      conferences,
      sportsbooks,
      spreadCoverage: totalGames ? ((spreadCount / totalGames) * 100).toFixed(1) : '0.0',
      totalsCoverage: totalGames ? ((totalCount / totalGames) * 100).toFixed(1) : '0.0',
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      sport,
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
    message: 'Football API Server is running',
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
  console.log(`🏈 Football Dashboard Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints:`);
  console.log(`   GET /api/games?sport={ncaaf|nfl}`);
  console.log(`   GET /api/stats?sport={ncaaf|nfl}`);
  console.log(`   GET /api/health - Health check`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});
