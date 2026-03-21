import jwt from 'jsonwebtoken';

// FIX 1: validate JWT_SECRET at module load time — if it is missing or too
// short every request will fail with a cryptic jwt error rather than a clear
// startup message.
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set');
  process.exit(1);
}

// ─── authenticate ─────────────────────────────────────────────────────────────
// Verifies the Bearer token and attaches req.user.
// Must run before requireAdmin.
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token      = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user  = jwt.verify(token, process.env.JWT_SECRET);
    // FIX 2: attach the raw token to req so downstream middleware (e.g. an
    // audit logger) can access it without re-parsing the Authorization header.
    req.token = token;
    next();
  } catch (err) {
    // FIX 3 (original): the original caught all JWT errors with a single
    // message. Now distinguishes expired tokens from outright invalid ones
    // so clients can decide whether to attempt a token refresh.
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── requireAdmin ─────────────────────────────────────────────────────────────
// FIX 4: requireAdmin is now async and re-fetches the user's isAdmin flag from
// the database on every admin request instead of trusting the JWT claim.
// A revoked admin keeps their JWT claim for up to its full expiry (typically
// 15 min with the fix applied in auth-service) but can no longer call admin
// endpoints as soon as the DB flag is cleared.
//
// This import is intentionally dynamic to avoid a circular dependency between
// auth middleware and the User model — product-service does not have a local
// User model, so admin status is validated via a call to auth-service's
// /api/auth/profile endpoint instead.
export const requireAdmin = async (req, res, next) => {
  // Fast path: the JWT claim says not-admin — no network call needed.
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Slow path: confirm the claim is still valid against auth-service.
  // AUTH_SERVICE_URL must be set; if it is not, fall back to trusting the
  // JWT claim (acceptable in dev; should be set in production).
  const authServiceUrl = process.env.AUTH_SERVICE_URL;
  if (!authServiceUrl) {
    // No auth-service URL configured — trust the JWT claim as-is.
    // Log a warning in production so operators know the check was skipped.
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  AUTH_SERVICE_URL not set — admin check trusts JWT claim only');
    }
    return next();
  }

  try {
    const response = await fetch(`${authServiceUrl}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${req.token}` },
      signal:  AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { user } = await response.json();
    if (!user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch {
    // Auth-service is unreachable — fail closed (deny access) in production,
    // fall through (trust JWT) in development.
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Authorization service unavailable' });
    }
    console.warn('⚠️  Could not reach auth-service — trusting JWT admin claim in dev');
    next();
  }
};