module.exports = async (req, res) => {
  res.status(200).json({
    ok: true,
    node: process.version,
    supabaseUrl: !!process.env.SUPABASE_URL,
    anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    redis: !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL),
    env: process.env.VERCEL_ENV || 'unknown'
  });
};
