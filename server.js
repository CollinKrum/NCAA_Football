// server.js — JSON file-based version
const fs = require('fs');
const path = require('path');

function loadJsonData(sport) {
  const filePath = path.join(__dirname, 'public', 'data', `${sport.toLowerCase()}-games.json`);
  
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error(`Error loading ${sport} data:`, error);
    return [];
  }
}

function generateStats(games) {
  if (!Array.isArray(games) || games.length === 0) {
    return {
      totalGames: 0,
      spreadCoverage: 0,
      totalsCoverage: 0,
      seasons: [],
      conferences: [],
      sportsbooks: []
    };
  }

  const totalGames = games.length;
  
  // Count games with spread data
  const gamesWithSpreads = games.filter(g => 
    g.spread !== null && g.spread !== undefined && g.spread !== ''
  ).length;
  
  // Count games with totals data
  const gamesWithTotals = games.filter(g => 
    g.overUnder !== null && g.overUnder !== undefined && g.overUnder !== ''
  ).length;
  
  const spreadCoverage = totalGames > 0 ? (gamesWithSpreads / totalGames) * 100 : 0;
  const totalsCoverage = totalGames > 0 ? (gamesWithTotals / totalGames) * 100 : 0;
  
  // Extract unique values
  const seasons = [...new Set(games.map(g => g.season || g.Season).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  const conferences = [...new Set(games.flatMap(g => [g.homeConference || g.HomeConference, g.awayConference || g.AwayConference]).filter(Boolean))].sort();
  const sportsbooks = [...new Set(games.map(g => g.lineProvider || g.LineProvider).filter(Boolean))].sort();
  
  return {
    totalGames,
    spreadCoverage,
    totalsCoverage,
    seasons,
    conferences,
    sportsbooks
  };
}

module.exports = async (req, res) => {
  try {
    const { pathname, searchParams } = new URL(req.url, `https://${req.headers.host}`);

    // Health check
    if (pathname === '/api/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        node: process.version,
        dataSource: 'JSON files',
        env: process.env.VERCEL_ENV || 'unknown',
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // Stats endpoint
    if (pathname === '/api/stats') {
      const sport = searchParams.get('sport') || 'NCAAF';
      const games = loadJsonData(sport);
      const stats = generateStats(games);
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, data: stats }));
      return;
    }

    // Games endpoint
    if (pathname === '/api/games') {
      const sport = searchParams.get('sport') || 'NCAAF';
      const season = searchParams.get('season');
      const conference = searchParams.get('conference');
      const book = searchParams.get('book');
      const limit = parseInt(searchParams.get('limit')) || 500;

      let games = loadJsonData(sport);
      
      // Apply filters
      if (season) {
        games = games.filter(g => String(g.season || g.Season || '') === String(season));
      }
      
      if (conference) {
        games = games.filter(g => 
          (g.homeConference || g.HomeConference) === conference || 
          (g.awayConference || g.AwayConference) === conference
        );
      }
      
      if (book) {
        games = games.filter(g => (g.lineProvider || g.LineProvider) === book);
      }
      
      // Sort by date (newest first)
      games.sort((a, b) => {
        const dateA = new Date(a.startDate || a.StartDate || 0).getTime();
        const dateB = new Date(b.startDate || b.StartDate || 0).getTime();
        return dateB - dateA;
      });
      
      // Limit results
      games = games.slice(0, limit);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        success: true, 
        count: games.length, 
        data: games 
      }));
      return;
    }

    // Fallback
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Not found');
    
  } catch (err) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 
      ok: false, 
      error: String(err && err.message),
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }));
  }
};
