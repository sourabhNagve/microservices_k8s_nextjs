import jwt from 'jsonwebtoken';

// Validate JWT_SECRET at module load time
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set');
  process.exit(1);
}

// ─── authenticate ─────────────────────────────────────────────────────────────
// Verifies the Bearer token and attaches req.user.
// Must run before requireAdmin.
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    // Attach the raw token to req so downstream middleware can access it
    req.token = token;
    next();
  } catch (err) {
    // Distinguish between expired tokens and invalid tokens
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── requireAdmin ─────────────────────────────────────────────────────────────
// Verifies user is admin — must run after authenticate
export const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
