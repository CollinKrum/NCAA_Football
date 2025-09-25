// server.js — Vercel serverless function (CommonJS)

const { createClient } = require('@supabase/supabase-js');

// ---------- Redis (Upstash) lazy init with better error handling ----------
let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    
    if (!url || !token) {
      console.log('Redis environment variables not found, running without cache');
      return null;
    }
    
    const { Redis } = require('@upstash/redis');
    _redis = new Redis({ 
      url, 
      token,
      // Add these options for better Vercel compatibility
      retry: {
        retries: 3,
        backoff: (retryCount) => Math.exp(retryCount) * 50,
      },
      // Disable auto-pipelining for serverless environments
      enableAutoPipelining: false,
    });
    
    console.log('Redis client initialized successfully');
    return _redis;
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    return null;
  }
}

// ---------- Supabase client ----------
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------- Enhanced cache helper with timeout ----------
async function cacheGetSet(redis, key, ttlSeconds, fetcher) {
  if (!redis) {
    console.log('No Redis available, fetching directly');
    return fetcher();
  }
  
  try {
    // Set a timeout for Redis operations
    const redisTimeout = (operation) => {
      return Promise.race([
        operation,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), 5000)
        )
      ]);
    };
    
    const hit = await redisTimeout(redis.get(key));
    if (hit !== null) {
      console.log(`Cache hit for ${key}`);
      return hit;
    }
  } catch (error) {
    console.error(`Redis get error for ${key}:`, error);
  }
  
  console.log(`Cache miss for ${key}, fetching data`);
  const data = await fetcher();
  
  // Attempt to cache the result, but don't fail if Redis is down
  try {
    const redisTimeout = (operation) => {
      return Promise.race([
        operation,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), 5000)
        )
      ]);
    };
    
    await redisTimeout(redis.set(key, data, { ex: ttlSeconds }));
    console.log(`Data cached for ${key}`);
  } catch (error) {
    console.error(`Redis set error for ${key}:`, error);
  }
  
  return data;
}

module.exports = async (req, res) => {
  try {
    const { pathname, searchParams } = new URL(req.url, `https://${req.headers.host}`);

    // --- Health check with enhanced diagnostics ---
    if (pathname === '/api/health') {
      const redis = getRedis();
      let redisStatus = 'not_configured';
      
      if (redis) {
        try {
          await redis.ping();
          redisStatus = 'connected';
        } catch (error) {
          redisStatus = 'error';
        }
      }
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          node: process.version,
          supabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_ANON_KEY,
          serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          redis: redisStatus,
          env: process.env.VERCEL_ENV || 'unknown',
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // --- /api/stats -> Supabase RPC get_dashboard_stats ---
    if (pathname === '/api/stats') {
      const sport = searchParams.get('sport') || 'NCAAF';
      const season = searchParams.get('season')
        ? Number(searchParams.get('season'))
        : null;

      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('get_dashboard_stats', {
        p_sport: sport,
        p_season: season,
      });
      if (error) throw error;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, data: data ?? {} }));
      return;
    }

    // --- /api/games -> Supabase RPC get_games_for_dashboard (with optional Redis cache) ---
    if (pathname === '/api/games') {
      const sport = searchParams.get('sport') || 'NCAAF';
      const season = searchParams.get('season')
        ? Number(searchParams.get('season'))
        : null;
      const conference = searchParams.get('conference');
      const book = searchParams.get('book');
      const limit = searchParams.get('limit')
        ? Number(searchParams.get('limit'))
        : 500;

      const redis = getRedis();
      const supabase = getSupabase();
      const cacheKey = `games:${sport}:${season || 'all'}:${conference || 'all'}:${book || 'all'}:${limit}`;

      const data = await cacheGetSet(redis, cacheKey, 300, async () => {
        const { data, error } = await supabase.rpc('get_games_for_dashboard', {
          p_sport: sport,
          p_season: season,
          p_conference: conference,
          p_sportsbook: book,
          p_limit: limit,
        });
        if (error) throw error;
        return data || [];
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, count: (data || []).length, data }));
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
