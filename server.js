const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

// Initialize Supabase if credentials are available
if (supabaseUrl && supabaseServiceKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('🗄️ Supabase client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Supabase:', error);
  }
} else {
  console.log('⚠️ Supabase credentials not found, using JSON fallback mode');
}

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

// ============================================================================
// SUPABASE DATA FUNCTIONS
// ============================================================================

// Load games from Supabase database
async function loadGamesFromDatabase(requestedSport, filters = {}) {
  if (!supabase) {
    throw new Error('Supabase not initialized');
  }

  const sport = resolveSportKey(requestedSport);
  const { season, week, conference, sportsbook, limit = 2000 } = filters;

  console.log(`🗄️ Loading ${sport.toUpperCase()} games from Supabase...`);

  try {
    // Use your custom database function for optimal performance
    const { data: games, error } = await supabase.rpc('get_games_for_dashboard', {
      p_sport: sport.toUpperCase(),
      p_season: season ? parseInt(season) : null,
      p_conference: conference || null,
      p_sportsbook: sportsbook || null,
      p_limit: Math.min(parseInt(limit) || 2000, 2000)
    });

    if (error) {
      console.error('❌ Supabase query error:', error);
      throw error;
    }

    console.log(`✅ Loaded ${games?.length || 0} ${sport.toUpperCase()} games from database`);
    return games || [];

  } catch (error) {
    console.error(`❌ Database error for ${sport}:`, error);
    throw error;
  }
}

// Get stats from Supabase database
async function getStatsFromDatabase(requestedSport, season = null) {
  if (!supabase) {
    throw new Error('Supabase not initialized');
  }

  const sport = resolveSportKey(requestedSport);
  console.log(`📊 Getting ${sport.toUpperCase()} stats from Supabase...`);

  try {
    // Use your custom database function
    const { data: stats, error } = await supabase.rpc('get_dashboard_stats', {
      p_sport: sport.toUpperCase(),
      p_season: season ? parseInt(season) : null
    });

    if (error) {
      console.error('❌ Stats query error:', error);
      throw error;
    }

    // Add sharp money insights
    const { data: sharpSignals, error: sharpError } = await supabase
      .from('sharp_money_signals')
      .select('id, signal_type, confidence_score')
      .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // Last 30 days

    const sharpCount = sharpSignals?.length || 0;
    const avgConfidence = sharpSignals?.length 
      ? sharpSignals.reduce((acc, s) => acc + (s.confidence_score || 0), 0) / sharpSignals.length
      : 0;

    const enhancedStats = {
      ...stats,
      sport: sport,
      sharpSignalsCount: sharpCount,
      avgSharpConfidence: Math.round(avgConfidence * 100),
      currentSeason: season || (stats.seasons && stats.seasons[0]) || new Date().getFullYear(),
      lastUpdated: new Date().toISOString()
    };

    console.log(`✅ Database stats:`, {
      totalGames: enhancedStats.totalGames,
      spreadCoverage: enhancedStats.spreadCoverage,
      sharpSignals: sharpCount
    });

    return enhancedStats;

  } catch (error) {
    console.error(`❌ Stats database error for ${sport}:`, error);
    throw error;
  }
}

// ============================================================================
// FALLBACK JSON FUNCTIONS (Your existing code preserved)
// ============================================================================

// Load games from JSON (fallback when Supabase unavailable)
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
async function getGamesData(requestedSport, filters = {}) {
  const sport = resolveSportKey(requestedSport);
  
  // Try Supabase first
  if (supabase) {
    try {
      return await loadGamesFromDatabase(sport, filters);
    } catch (error) {
      console.error(`❌ Database failed, falling back to JSON for ${sport}:`, error.message);
    }
  }

  // Fallback to JSON/cache system
  const cache = gameCaches[sport];
  const now = Date.now();

  if (cache.data && cache.timestamp && (now - cache.timestamp) < CACHE_DURATION) {
    let games = cache.data;

    // Apply filters for JSON fallback
    if (filters.season) {
      games = games.filter(g => g.season == filters.season);
    }
    if (filters.week) {
      games = games.filter(g => g.week == filters.week);
    }
    if (filters.conference) {
      games = games.filter(g => 
        g.homeConference?.toLowerCase().includes(filters.conference.toLowerCase()) ||
        g.awayConference?.toLowerCase().includes(filters.conference.toLowerCase())
      );
    }
    if (filters.limit) {
      games = games.slice(0, parseInt(filters.limit));
    }

    return games;
  }

  try {
    const games = await loadGamesForSport(sport);
    cache.data = games;
    cache.timestamp = now;

    // Apply filters
    let filteredGames = games;
    if (filters.season) {
      filteredGames = filteredGames.filter(g => g.season == filters.season);
    }
    if (filters.week) {
      filteredGames = filteredGames.filter(g => g.week == filters.week);
    }
    if (filters.conference) {
      filteredGames = filteredGames.filter(g => 
        g.homeConference?.toLowerCase().includes(filters.conference.toLowerCase()) ||
        g.awayConference?.toLowerCase().includes(filters.conference.toLowerCase())
      );
    }
    if (filters.limit) {
      filteredGames = filteredGames.slice(0, parseInt(filters.limit));
    }

    return filteredGames;
  } catch (error) {
    console.error(`Error loading ${sport} games data:`, error);
    return cache.data || [];
  }
}

// ============================================================================
// API ROUTES (Enhanced with Supabase integration)
// ============================================================================

// Enhanced /api/games endpoint with Supabase support
app.get('/api/games', async (req, res) => {
  try {
    const { season, week, team, conference, limit, sport: sportParam } = req.query;
    const sport = resolveSportKey(sportParam);
    
    const filters = {
      season,
      week,
      conference,
      limit
    };

    let games = await getGamesData(sport, filters);
    
    // Apply team filter (not supported in database function yet)
    if (team) {
      games = games.filter(g => 
        g.homeTeam?.toLowerCase().includes(team.toLowerCase()) || 
        g.awayTeam?.toLowerCase().includes(team.toLowerCase())
      );
    }

    // Enhance games with sharp money signals if using database
    if (supabase && games.length > 0) {
      try {
        // Get sharp signals for these games (assuming games have IDs from database)
        const gameIds = games.map(g => g.id).filter(Boolean);
        
        if (gameIds.length > 0) {
          const { data: signals } = await supabase
            .from('sharp_money_signals')
            .select('game_id, signal_type, movement_size, confidence_score')
            .in('game_id', gameIds);

          // Add sharp signals to games
          games = games.map(game => {
            const gameSignals = signals?.filter(s => s.game_id === game.id) || [];
            return {
              ...game,
              sharpSignals: gameSignals.map(s => s.signal_type),
              sharpConfidence: gameSignals.length 
                ? Math.max(...gameSignals.map(s => s.confidence_score || 0))
                : null,
              hasSharpAction: gameSignals.length > 0
            };
          });
        }
      } catch (signalError) {
        console.error('⚠️ Failed to load sharp signals:', signalError.message);
        // Continue without signals
      }
    }

    const response = {
      success: true,
      sport,
      count: games.length,
      data: games,
      source: supabase ? 'database' : 'json',
      timestamp: new Date().toISOString()
    };

    console.log(`✅ /api/games: Returned ${games.length} ${sport.toUpperCase()} games (${response.source})`);
    res.json(response);

  } catch (error) {
    console.error('❌ Error in /api/games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games data',
      details: error.message
    });
  }
});

// Enhanced /api/stats endpoint with Supabase support
app.get('/api/stats', async (req, res) => {
  try {
    const { sport: sportParam, season } = req.query;
    const sport = resolveSportKey(sportParam);

    let stats;

    // Try Supabase first
    if (supabase) {
      try {
        stats = await getStatsFromDatabase(sport, season);
        console.log(`✅ /api/stats: Database stats for ${sport.toUpperCase()}`);
        return res.json({
          success: true,
          sport,
          data: stats,
          source: 'database'
        });
      } catch (error) {
        console.error(`❌ Database stats failed, falling back to JSON for ${sport}:`, error.message);
      }
    }

    // Fallback to JSON-based stats
    const games = await getGamesData(sport, { season });

    const totalGames = games.length;
    const seasons = [...new Set(games.map(g => g.season))].filter(Boolean).sort((a, b) => Number(a) - Number(b));
    const conferences = [...new Set([...games.map(g => g.homeConference), ...games.map(g => g.awayConference)])].filter(Boolean).sort();
    const sportsbooks = [...new Set(games.map(g => g.lineProvider).filter(Boolean))].sort();
    const spreadCount = games.filter(g => g.spread !== null && g.spread !== undefined).length;
    const totalCount = games.filter(g => g.overUnder !== null && g.overUnder !== undefined).length;

    stats = {
      sport,
      totalGames,
      seasons,
      conferences,
      sportsbooks,
      spreadCoverage: totalGames ? ((spreadCount / totalGames) * 100).toFixed(1) : '0.0',
      totalsCoverage: totalGames ? ((totalCount / totalGames) * 100).toFixed(1) : '0.0',
      lastUpdated: new Date().toISOString()
    };

    console.log(`✅ /api/stats: JSON fallback stats for ${sport.toUpperCase()}`);
    res.json({
      success: true,
      sport,
      data: stats,
      source: 'json'
    });

  } catch (error) {
    console.error('❌ Error in /api/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate stats',
      details: error.message
    });
  }
});

// NEW: Sharp money signals endpoint
app.get('/api/sharp-signals', async (req, res) => {
  if (!supabase) {
    return res.json({
      success: true,
      data: [],
      message: 'Sharp signals require database connection'
    });
  }

  try {
    const sport = resolveSportKey(req.query.sport);
    const season = req.query.season ? parseInt(req.query.season) : null;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    console.log(`⚡ Getting sharp signals for ${sport.toUpperCase()}`);

    let query = supabase
      .from('sharp_money_signals')
      .select(`
        *,
        games!inner(
          home_team,
          away_team,
          sport,
          season,
          week,
          start_date,
          spread,
          opening_spread,
          over_under,
          opening_over_under
        )
      `)
      .eq('games.sport', sport.toUpperCase())
      .order('detected_at', { ascending: false })
      .limit(limit);

    if (season) {
      query = query.eq('games.season', season);
    }

    const { data: signals, error } = await query;

    if (error) {
      throw error;
    }

    console.log(`✅ Returning ${signals?.length || 0} sharp signals`);

    res.json({ 
      success: true, 
      data: signals || [],
      sport,
      source: 'database'
    });

  } catch (error) {
    console.error('❌ Sharp signals endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch sharp signals',
      data: [] 
    });
  }
});

// NEW: Team performance endpoint
app.get('/api/team-performance', async (req, res) => {
  if (!supabase) {
    return res.json({
      success: true,
      data: [],
      message: 'Team performance analysis requires database connection'
    });
  }

  try {
    const sport = resolveSportKey(req.query.sport);
    const season = req.query.season ? parseInt(req.query.season) : null;
    const conference = req.query.conference || null;

    console.log(`🏟️ Getting team performance for ${sport.toUpperCase()}`);

    const { data: performance, error } = await supabase.rpc('calculate_ats_performance', {
      p_sport: sport.toUpperCase(),
      p_season: season,
      p_conference: conference
    });

    if (error) {
      throw error;
    }

    console.log(`✅ Returning performance for ${performance?.length || 0} teams`);

    res.json({ 
      success: true, 
      data: performance || [],
      sport,
      source: 'database'
    });

  } catch (error) {
    console.error('❌ Team performance endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch team performance',
      data: [] 
    });
  }
});

// NEW: Refresh sharp signals endpoint
app.post('/api/refresh-signals', async (req, res) => {
  if (!supabase) {
    return res.json({
      success: false,
      error: 'Sharp signal refresh requires database connection'
    });
  }

  try {
    console.log('🔄 Refreshing sharp money signals...');

    const { data: count, error } = await supabase.rpc('detect_sharp_movements');

    if (error) {
      throw error;
    }

    console.log(`✅ Processed ${count} games for sharp signals`);

    res.json({ 
      success: true, 
      message: `Sharp money detection complete: ${count} games processed`,
      gamesProcessed: count 
    });

  } catch (error) {
    console.error('❌ Signal refresh endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to refresh sharp signals' 
    });
  }
});

// Health check endpoint (enhanced)
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Football API Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: supabase ? 'connected' : 'json-fallback',
    features: {
      sharpMoney: !!supabase,
      teamAnalytics: !!supabase,
      marketEfficiency: !!supabase,
      advancedNFL: true,
      jsonFallback: true
    }
  });
});

// NEW: Database import endpoint (for importing your JSON data)
app.post('/api/import-data', async (req, res) => {
  if (!supabase) {
    return res.json({
      success: false,
      error: 'Data import requires database connection'
    });
  }

  try {
    const { sport, force = false } = req.body;
    const targetSport = resolveSportKey(sport);
    const config = SPORT_CONFIG[targetSport];

    console.log(`📥 Starting data import for ${config.label}...`);

    // Load from JSON file
    if (!fs.existsSync(config.dataFile)) {
      return res.status(404).json({
        success: false,
        error: `JSON file not found: ${config.dataFile}`
      });
    }

    const rawData = fs.readFileSync(config.dataFile, 'utf8');
    const rawGames = JSON.parse(rawData);
    
    console.log(`📊 Converting ${rawGames.length} ${config.label} games...`);

    // Convert to database format
    const convertedGames = rawGames.map(game => ({
      season: game.Season || game.season,
      week: game.Week || game.week,
      start_date: game.StartDate || game.startDate,
      sport: targetSport.toUpperCase(),
      
      home_team: game.HomeTeam || game.homeTeam,
      away_team: game.AwayTeam || game.awayTeam,
      home_conference: game.HomeConference || game.homeConference,
      away_conference: game.AwayConference || game.awayConference,
      
      home_score: game.HomeScore || game.homeScore,
      away_score: game.AwayScore || game.awayScore,
      
      spread: game.Spread || game.spread,
      over_under: game.OverUnder || game.overUnder,
      home_moneyline: game.HomeMoneyline || game.homeMoneyline,
      away_moneyline: game.AwayMoneyline || game.awayMoneyline,
      
      opening_spread: game.OpeningSpread || game.openingSpread,
      opening_over_under: game.OpeningOverUnder || game.openingOverUnder,
      home_moneyline_open: game.HomeMoneylineOpen || game.homeMoneylineOpen,
      away_moneyline_open: game.AwayMoneylineOpen || game.awayMoneylineOpen,
      
      // NFL Advanced fields
      home_line_min: game.HomeLineMin || game.homeLineMin,
      home_line_max: game.HomeLineMax || game.homeLineMax,
      home_moneyline_min: game.HomeMoneylineMin || game.homeMoneylineMin,
      home_moneyline_max: game.HomeMoneylineMax || game.homeMoneylineMax,
      away_moneyline_min: game.AwayMoneylineMin || game.awayMoneylineMin,
      away_moneyline_max: game.AwayMoneylineMax || game.awayMoneylineMax,
      
      total_score_min: game.TotalScoreMin || game.totalScoreMin,
      total_score_max: game.TotalScoreMax || game.totalScoreMax,
      total_over_open: game.TotalScoreOverOpen || game.totalScoreOverOpen,
      total_over_close: game.TotalScoreOverClose || game.totalScoreOverClose,
      total_under_open: game.TotalScoreUnderOpen || game.totalScoreUnderOpen,
      total_under_close: game.TotalScoreUnderClose || game.totalScoreUnderClose,
      
      home_line_odds_open: game.HomeLineOddsOpen || game.homeLineOddsOpen,
      home_line_odds_close: game.HomeLineOddsClose || game.homeLineOddsClose,
      away_line_odds_open: game.AwayLineOddsOpen || game.awayLineOddsOpen,
      away_line_odds_close: game.AwayLineOddsClose || game.awayLineOddsClose,
      
      neutral_venue: game.NeutralVenue || game.neutralVenue || false,
      playoff_game: game.PlayoffGame || game.playoffGame || false,
      line_provider: game.LineProvider || game.lineProvider,
      notes: game.Notes || game.notes
    })).filter(game => game.season && game.home_team && game.away_team);

    console.log(`✅ Converted ${convertedGames.length} valid games`);

    // Bulk insert in batches
    const batchSize = 100;
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < convertedGames.length; i += batchSize) {
      const batch = convertedGames.slice(i, i + batchSize);
      
      try {
        const { data, error } = await supabase
          .from('games')
          .upsert(batch, { 
            onConflict: 'sport,season,week,home_team,away_team',
            ignoreDuplicates: !force 
          })
          .select('id');

        if (error) {
          console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error);
          skipped += batch.length;
          continue;
        }

        imported += data?.length || batch.length;
        console.log(`✅ Imported batch ${Math.floor(i/batchSize) + 1}: ${imported}/${convertedGames.length} games`);
      } catch (batchError) {
        console.error(`❌ Batch error:`, batchError);
        skipped += batch.length;
      }
    }

    // Run sharp money detection after import
    console.log('⚡ Running sharp money detection...');
    const { data: sharpCount } = await supabase.rpc('detect_sharp_movements');

    console.log(`🎉 Import complete: ${imported} imported, ${skipped} skipped, ${sharpCount} sharp signals detected`);

    res.json({
      success: true,
      message: `${config.label} data import complete`,
      imported,
      skipped,
      sharpSignalsDetected: sharpCount,
      total: convertedGames.length
    });

  } catch (error) {
    console.error('❌ Data import error:', error);
    res.status(500).json({
      success: false,
      error: 'Data import failed',
      details: error.message
    });
  }
});

// Serve the main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🏈 Football Dashboard Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints:`);
  console.log(`   GET /api/games?sport={ncaaf|nfl} - Get games data`);
  console.log(`   GET /api/stats?sport={ncaaf|nfl} - Get dashboard stats`);
  console.log(`   GET /api/health - Health check`);
  
  if (supabase) {
    console.log(`🗄️ Enhanced endpoints (Database enabled):`);
    console.log(`   GET /api/sharp-signals?sport={ncaaf|nfl} - Sharp money signals`);
    console.log(`   GET /api/team-performance?sport={ncaaf|nfl} - Team ATS performance`);
    console.log(`   POST /api/refresh-signals - Refresh sharp money detection`);
    console.log(`   POST /api/import-data - Import JSON data to database`);
  } else {
    console.log(`⚠️ Database features disabled - Add Supabase credentials to enable:`);
    console.log(`   NEXT_PUBLIC_SUPABASE_URL=your_url`);
    console.log(`   SUPABASE_SERVICE_ROLE_KEY=your_key`);
  }
  
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});
