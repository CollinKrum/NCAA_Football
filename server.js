const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve your HTML files from 'public' folder

// Cache configuration (shared Redis via Upstash + local fallback)
const CACHE_DURATION_SECONDS = 5 * 60; // 5 minutes
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SUPABASE_MAX_ROWS = Math.max(
  1,
  Number.parseInt(process.env.SUPABASE_MAX_ROWS || '2000', 10) || 2000
);
const SUPABASE_SPORT_COLUMN = (process.env.SUPABASE_SPORT_COLUMN || 'sport').trim();
const SUPABASE_NCAAF_FILTER_VALUE = (process.env.SUPABASE_NCAAF_FILTER_VALUE || 'NCAAF').trim();
const SUPABASE_NFL_FILTER_VALUE = (process.env.SUPABASE_NFL_FILTER_VALUE || 'NFL').trim();
const SUPABASE_GLOBAL_ORDER_COLUMN = (process.env.SUPABASE_ORDER_COLUMN || '').trim() || 'start_date';
const SUPABASE_NCAAF_ORDER_COLUMN =
  (process.env.SUPABASE_NCAAF_ORDER_COLUMN || '').trim() || SUPABASE_GLOBAL_ORDER_COLUMN;
const SUPABASE_NFL_ORDER_COLUMN =
  (process.env.SUPABASE_NFL_ORDER_COLUMN || '').trim() || SUPABASE_GLOBAL_ORDER_COLUMN;

function parseEnvBoolean(value, fallback = false) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 't', 'yes', 'y', 'on'].includes(normalized);
}

const SUPABASE_GLOBAL_ORDER_ASC = parseEnvBoolean(process.env.SUPABASE_ORDER_ASC, false);
const SUPABASE_NCAAF_ORDER_ASC = parseEnvBoolean(
  process.env.SUPABASE_NCAAF_ORDER_ASC,
  SUPABASE_GLOBAL_ORDER_ASC
);
const SUPABASE_NFL_ORDER_ASC = parseEnvBoolean(
  process.env.SUPABASE_NFL_ORDER_ASC,
  SUPABASE_GLOBAL_ORDER_ASC
);

const supabaseTables = {
  ncaaf:
    process.env.SUPABASE_NCAAF_TABLE ||
    process.env.SUPABASE_GAMES_TABLE ||
    'games',
  nfl:
    process.env.SUPABASE_NFL_TABLE ||
    process.env.SUPABASE_GAMES_TABLE ||
    'games'
};

const hasUpstash = Boolean(upstashUrl && upstashToken);
const hasSupabase = Boolean(supabaseUrl && supabaseKey);

const normalizedUpstashUrl = hasUpstash ? upstashUrl.replace(/\/+$/, '') : null;
const upstashPipelineUrl = normalizedUpstashUrl
  ? (normalizedUpstashUrl.endsWith('/pipeline')
      ? normalizedUpstashUrl
      : `${normalizedUpstashUrl}/pipeline`)
  : null;

if (!hasUpstash) {
  console.warn('⚠️  Upstash Redis environment variables not configured. Falling back to in-memory caching.');
}

let supabaseClient = null;

if (hasSupabase) {
  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });
} else {
  console.warn('⚠️  Supabase environment variables not configured. Falling back to JSON/demo data.');
}

async function executeUpstashCommand(...args) {
  if (!hasUpstash || !upstashPipelineUrl) return null;

  const response = await fetch(upstashPipelineUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${upstashToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([args])
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upstash request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const [result] = Array.isArray(payload) ? payload : [];

  if (!result) {
    return null;
  }

  if (result.error) {
    throw new Error(`Upstash error: ${result.error}`);
  }

  return Object.prototype.hasOwnProperty.call(result, 'result') ? result.result : null;
}

async function readCache(key) {
  try {
    const result = await executeUpstashCommand('GET', key);
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    return null;
  } catch (error) {
    console.error(`⚠️  Unable to read cache for key ${key}:`, error.message);
    return null;
  }
}

async function writeCache(key, value) {
  try {
    await executeUpstashCommand('SET', key, JSON.stringify(value), 'EX', CACHE_DURATION_SECONDS);
  } catch (error) {
    console.error(`⚠️  Unable to write cache for key ${key}:`, error.message);
  }
}

// In-memory cache for games data (fallback when Upstash is unavailable)
const CACHE_DURATION = CACHE_DURATION_SECONDS * 1000;

const DEFAULT_SPORT = 'ncaaf';

const SPORT_CONFIG = {
  ncaaf: {
    label: 'NCAAF',
    dataFile: path.join(__dirname, 'data/ncaaf-games.json'),
    mapper: mapNCAAFGame,
    demo: generateNCAAFDemoData,
    supabase: {
      table: supabaseTables.ncaaf,
      filter: query => {
        if (SUPABASE_SPORT_COLUMN && SUPABASE_NCAAF_FILTER_VALUE) {
          return query.eq(SUPABASE_SPORT_COLUMN, SUPABASE_NCAAF_FILTER_VALUE);
        }
        return query;
      },
      orderBy: SUPABASE_NCAAF_ORDER_COLUMN
        ? { column: SUPABASE_NCAAF_ORDER_COLUMN, ascending: SUPABASE_NCAAF_ORDER_ASC }
        : null
    }
  },
  nfl: {
    label: 'NFL',
    dataFile: path.join(__dirname, 'data/nfl-games.json'),
    mapper: mapNFLGame,
    demo: generateNFLDemoData,
    supabase: {
      table: supabaseTables.nfl,
      filter: query => {
        if (SUPABASE_SPORT_COLUMN && SUPABASE_NFL_FILTER_VALUE) {
          return query.eq(SUPABASE_SPORT_COLUMN, SUPABASE_NFL_FILTER_VALUE);
        }
        return query;
      },
      orderBy: SUPABASE_NFL_ORDER_COLUMN
        ? { column: SUPABASE_NFL_ORDER_COLUMN, ascending: SUPABASE_NFL_ORDER_ASC }
        : null
    }
  }
};

const gameCaches = Object.fromEntries(
  Object.keys(SPORT_CONFIG).map(sport => [sport, { data: null, timestamp: null }])
);

async function getCachedGames(sport) {
  const cacheKey = `games:${sport}`;

  if (hasUpstash) {
    const cached = await readCache(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) {
      console.log(`📦 Serving ${SPORT_CONFIG[sport].label} games from Upstash cache`);
      return cached;
    }
  }

  const memoryCache = gameCaches[sport];
  if (memoryCache.data && Date.now() - memoryCache.timestamp < CACHE_DURATION) {
    console.log(`📦 Serving ${SPORT_CONFIG[sport].label} games from in-memory cache`);
    return memoryCache.data;
  }

  return null;
}

async function setCachedGames(sport, games) {
  const cacheKey = `games:${sport}`;
  gameCaches[sport] = { data: games, timestamp: Date.now() };

  if (hasUpstash) {
    await writeCache(cacheKey, games);
  }
}

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
  const { dataFile, mapper, demo, label, supabase } = config;

  const cachedGames = await getCachedGames(sport);
  if (cachedGames) {
    return cachedGames;
  }

  if (supabaseClient && supabase && supabase.table) {
    const supabaseGames = await loadGamesFromSupabase(supabase, mapper, label);
    if (Array.isArray(supabaseGames) && supabaseGames.length > 0) {
      await setCachedGames(sport, supabaseGames);
      return supabaseGames;
    }
  }

  try {
    if (!fs.existsSync(dataFile)) {
      console.log(`[${label}] JSON file not found, using demo data...`);
      const demoGames = demo();
      await setCachedGames(sport, demoGames);
      return demoGames;
    }

    console.log(`📂 Reading ${label} JSON file...`);
    const rawData = fs.readFileSync(dataFile, 'utf8');
    console.log(`📊 Parsing ${label} JSON data...`);
    const rawGames = JSON.parse(rawData);

    const games = rawGames.map(mapper).filter(Boolean);
    console.log(`✅ Loaded ${games.length} ${label} games from JSON file`);
    await setCachedGames(sport, games);
    return games;
  } catch (error) {
    console.error(`❌ Error reading ${label} JSON:`, error.message);
    console.log(`🔄 Falling back to ${label} demo data`);
    const demoGames = demo();
    await setCachedGames(sport, demoGames);
    return demoGames;
  }
}

async function loadGamesFromSupabase(config, mapper, label) {
  if (!supabaseClient || !config || !config.table) return null;

  const { table, filter, orderBy, select = '*', limit } = config;

  try {
    console.log(`☁️  Fetching ${label} games from Supabase table "${table}"...`);

    let query = supabaseClient.from(table).select(select);

    if (typeof filter === 'function') {
      const filteredQuery = filter(query);
      if (filteredQuery) {
        query = filteredQuery;
      }
    }

    if (orderBy && orderBy.column) {
      try {
        query = query.order(orderBy.column, {
          ascending: Boolean(orderBy.ascending),
          nullsFirst: Boolean(orderBy.nullsFirst)
        });
      } catch (orderError) {
        console.warn(
          `⚠️  Unable to apply Supabase order on column "${orderBy.column}" for table "${table}":`,
          orderError.message
        );
      }
    }

    query = query.limit(Number.isFinite(limit) ? Math.max(1, limit) : SUPABASE_MAX_ROWS);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn(`⚠️  Supabase table "${table}" returned no rows.`);
      return null;
    }

    const games = data.map(mapper).filter(Boolean);

    if (games.length === 0) {
      console.warn(`⚠️  Supabase data for table "${table}" did not produce any mapped games.`);
      return null;
    }

    console.log(`✅ Loaded ${games.length} ${label} games from Supabase`);
    return games;
  } catch (error) {
    console.error(`❌ Error loading ${label} games from Supabase:`, error.message);
    return null;
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
  const id = game.id ?? game.Id ?? game.game_id ?? null;
  const season = game.season ?? game.Season ?? null;
  const week = game.week ?? game.Week ?? null;
  const startDate = game.start_date ?? game.StartDate ?? game.startDate ?? null;
  const homeTeam =
    game.home_team ?? game.HomeTeam_x ?? game.HomeTeam ?? game.homeTeam ?? null;
  const awayTeam =
    game.away_team ?? game.AwayTeam_x ?? game.AwayTeam ?? game.awayTeam ?? null;
  const homeConference =
    game.home_conference ?? game.HomeConference ?? game.homeConference ?? null;
  const awayConference =
    game.away_conference ?? game.AwayConference ?? game.awayConference ?? null;
  const homeScore = toNumber(game.home_score ?? game.HomeScore ?? game.homeScore);
  const awayScore = toNumber(game.away_score ?? game.AwayScore ?? game.awayScore);
  const spread = toNumber(game.spread ?? game.Spread);
  const overUnder = toNumber(game.over_under ?? game.OverUnder ?? game.total);
  const openingSpread = toNumber(
    game.opening_spread ?? game.OpeningSpread ?? game.openingSpread
  );
  const openingOverUnder = toNumber(
    game.opening_over_under ?? game.OpeningOverUnder ?? game.openingOverUnder
  );
  const homeMoneyline = toNumber(
    game.home_moneyline ?? game.HomeMoneyline ?? game.homeMoneyline
  );
  const awayMoneyline = toNumber(
    game.away_moneyline ?? game.AwayMoneyline ?? game.awayMoneyline
  );
  const completedRaw =
    game.completed ?? game.Completed ?? game.game_completed ?? null;
  const completed = typeof completedRaw === 'boolean'
    ? completedRaw
    : (Number.isFinite(homeScore) && Number.isFinite(awayScore));
  const lineProvider =
    game.line_provider ?? game.LineProvider ?? game.lineProvider ?? null;
  const seasonType =
    game.season_type ?? game.SeasonType ?? game.seasonType ?? null;

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
  if (!key || !game || typeof game !== 'object') return null;

  const camelVariant = key.charAt(0).toLowerCase() + key.slice(1);
  const snakeVariant = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

  const variants = Array.from(
    new Set(
      [key, camelVariant, snakeVariant, snakeVariant.replace(/_/g, '')]
        .filter(Boolean)
    )
  );

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
  const neutralVenueRaw =
    game.neutral_venue ?? game.NeutralVenue ?? game.neutralVenue ?? game.neutral_site ?? null;
  const neutralVenue = typeof neutralVenueRaw === 'boolean'
    ? neutralVenueRaw
    : (neutralVenueRaw === null ? null : toBoolean(neutralVenueRaw));
  const playoffRaw =
    game.playoff_game ?? game.PlayoffGame ?? game.playoffGame ?? game.is_playoff_game;
  const playoffGame = typeof playoffRaw === 'boolean'
    ? playoffRaw
    : toBoolean(playoffRaw);
  const notes = game.notes ?? game.Notes ?? null;

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

  try {
    return await loadGamesForSport(sport);
  } catch (error) {
    console.error(`Error loading ${sport} games data:`, error);
    const cache = gameCaches[sport];
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
