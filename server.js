// server.js — Vercel serverless function (CommonJS)

const { createClient } = require('@supabase/supabase-js');

// ---------- Redis (Upstash) lazy init ----------
let _redis = null;
function getRedis() {
  if (_redis) return _redis;
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || null;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || null;
  if (url && token) {
    const { Redis } = require('@upstash/redis');
    _redis = new Redis({ url, token });
  }
  return _redis; // may be null (that’s fine)
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

// ---------- Small cache helper (optional) ----------
async function cacheGetSet(redis, key, ttlSeconds, fetcher) {
  if (!redis) return fetcher();
  const hit = await redis.get(key);
  if (hit !== null) return hit;
  const data = await fetcher();
  await redis.set(key, data, { ex: ttlSeconds });
  return data;
}

module.exports = async (req, res) => {
  try {
    const { pathname, searchParams } = new URL(req.url, `https://${req.headers.host}`);

    // --- Health check (no imports, no env reads that can throw) ---
    if (pathname === '/api/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          node: process.version,
          supabaseUrl:
            !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_ANON_KEY,
          serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          redis:
            !!process.env.UPSTASH_REDIS_REST_URL || !!process.env.KV_REST_API_URL,
          env: process.env.VERCEL_ENV || 'unknown',
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

      const data = await cacheGetSet(redis, cacheKey, 60, async () => {
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
    console.error(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: String(err && err.message) }));
  }
};
