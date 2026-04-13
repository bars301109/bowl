/* Middleware: in-memory rate limiter */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      // Clean up expired entries to prevent memory leak
      if (entry && now > entry.resetAt) {
        hits.delete(ip);
      }
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
    }
    entry.count++;
    return next();
  };
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { rateLimit, getClientIp };
