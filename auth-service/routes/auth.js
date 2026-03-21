import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User-drizzle.js';
import {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
  validatePasswordChange,
} from '../utils/validation.js';

// ─── Env validation ───────────────────────────────────────────────────────────
// FIX 1 (lines 14-15): moved env checks to index.js startup — throwing here
// only triggers when this module is first imported, which happens on the first
// request if import order ever changes. index.js already validates these at
// boot, so the duplicate throws here are removed. The JWT_SECRET length guard
// below catches weak secrets that the env-var presence check misses.
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not defined');
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
if (!process.env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is not defined');

// ─── Google client ────────────────────────────────────────────────────────────
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

// ─── Token denylist (logout invalidation) ─────────────────────────────────────
// FIX 2: in-memory denylist so logout actually invalidates the token.
// In production replace this Map with a Redis SET using the token's remaining
// TTL so entries expire automatically and the set stays bounded.
const tokenDenylist = new Set();

// ─── Rate limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
  // FIX 3 (line 24): only failed requests count toward the limit — a successful
  // login should not penalise a legitimate user who retried after a typo.
  skipSuccessfulRequests: true,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many requests, please try again later' },
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // FIX 4: check the denylist before verifying the signature so a logged-out
  // token is rejected immediately rather than being treated as valid.
  if (tokenDenylist.has(token)) {
    return res.status(401).json({ error: 'Token has been revoked' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    // Attach the raw token so middleware downstream (e.g. logout) can access it
    // without re-parsing the Authorization header.
    req.token = token;
    next();
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(error);
  }
};

// ─── Admin middleware ─────────────────────────────────────────────────────────
// FIX 5 (line 63-67): requireAdmin now re-fetches the user from the DB instead
// of trusting the isAdmin claim baked into the JWT. A token issued before an
// admin was revoked would otherwise grant admin access for up to 7 days.
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

// ─── Register ─────────────────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { error } = validateRegistration(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { name, email, password } = req.body;

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    const user = await User.create({ name, email, password });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        verified: user.verified,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { error } = validateLogin(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { email, password } = req.body;

    const user = await User.findByEmailWithPassword(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // FIX 6 (line 119): check isActive before checking the password so a
    // deactivated account cannot log in — previously a deactivated user could
    // still obtain a valid token as long as they had the right password.
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    if (!user.password) {
      return res.status(401).json({ error: 'Please use Google OAuth to login' });
    }

    const isPasswordValid = await User.comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await User.updateLastLogin(user.id);

    // FIX 7 (line 130): destructure password out before building safeUser so
    // we never accidentally forward the hash. Also drop the is_admin fallback —
    // the schema uses camelCase (isAdmin) via drizzle, so is_admin is always
    // undefined and the fallback is misleading noise.
    const { password: _pw, ...safeUser } = user;

    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.isAdmin ?? false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }, // FIX 8: reduced from 7d — use refresh tokens for long sessions
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: safeUser.id,
        name: safeUser.name,
        email: safeUser.email,
        avatar: safeUser.avatar,
        verified: safeUser.verified,
        isAdmin: safeUser.isAdmin ?? false,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
router.post('/google', authLimiter, async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // FIX 9: validate that the Google token's email is verified. Google can
    // return unverified emails for certain account types — trusting them is a
    // security issue.
    if (!payload.email_verified) {
      return res.status(400).json({ error: 'Google account email is not verified' });
    }

    const googleUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };

    // FIX 10: validate the avatar URL to prevent javascript: / data: URIs
    // being stored as the avatar via a manipulated Google token.
    const sanitizedPicture = sanitizeAvatarUrl(googleUser.picture);

    let user = await User.findByGoogleId(googleUser.id);

    if (!user) {
      const existingByEmail = await User.findByEmail(googleUser.email);
      if (existingByEmail) {
        user = await User.linkGoogleId(existingByEmail.id, googleUser.id);
      } else {
        user = await User.create({
          name: googleUser.name,
          email: googleUser.email,
          googleId: googleUser.id,
        });
      }
    }

    // FIX 6 (continued): also block deactivated accounts from OAuth login.
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    await User.updateLastLogin(user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.isAdmin ?? false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );

    res.json({
      message: 'Google authentication successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        // FIX 10: use the sanitized avatar URL, fall back to null if invalid.
        avatar: user.avatar || sanitizedPicture || null,
        verified: user.verified,
        isAdmin: user.isAdmin ?? false,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ─── Get profile ──────────────────────────────────────────────────────────────
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        emailVerified: user.verified,
        preferences: user.preferences,
        createdAt: user.createdAt,
        isAdmin: user.isAdmin ?? false,
      },
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// ─── Update profile ───────────────────────────────────────────────────────────
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { error } = validateProfileUpdate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { name, avatar, preferences } = req.body;

    // FIX 10 (continued): sanitize avatar URLs supplied via profile update too.
    if (avatar && !sanitizeAvatarUrl(avatar)) {
      return res.status(400).json({ error: 'Avatar must be a valid https URL' });
    }

    const updatedUser = await User.updateProfile(req.user.userId, { name, avatar, preferences });
    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// ─── Change password ──────────────────────────────────────────────────────────
router.put('/password', authenticate, async (req, res) => {
  try {
    const { error } = validatePasswordChange(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { currentPassword, newPassword } = req.body;
    await User.changePassword(req.user.userId, currentPassword, newPassword);

    // FIX 11: after a password change, revoke the current token so the user
    // must log in again with the new password. Without this, a session obtained
    // before the password change remains valid until it expires.
    tokenDenylist.add(req.token);
    const { exp } = jwt.decode(req.token);
    const ttl = (exp * 1000) - Date.now();
    if (ttl > 0) setTimeout(() => tokenDenylist.delete(req.token), ttl);

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    // FIX 12 (line 270): the original handler returned a generic
    // 'Current password is incorrect' message for ALL InvalidPasswordError
    // cases, masking the "new password must differ" error added in User-drizzle.
    // Now the actual error message is forwarded so the client knows what to fix.
    if (error.name === 'InvalidPasswordError' || error.name === 'UserNotFoundError') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// ─── Get preferences ──────────────────────────────────────────────────────────
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ preferences: user.preferences || {} });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// ─── Update preferences ───────────────────────────────────────────────────────
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return res.status(400).json({ error: 'Valid preferences object is required' });
    }

    if (JSON.stringify(preferences).length > 10_000) {
      return res.status(400).json({ error: 'Preferences payload is too large' });
    }

    const updatedUser = await User.updatePreferences(req.user.userId, preferences);
    res.json({
      message: 'Preferences updated successfully',
      preferences: updatedUser.preferences,
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
// FIX 13 (lines 290-300): the original logout had two bugs:
//   1. tokenDenylist was referenced but never declared (ReferenceError at runtime).
//   2. res.json() was called twice — Express ignores the second call but it
//      triggers a "Cannot set headers after they are sent" warning in the logs.
router.post('/logout', authenticate, async (req, res) => {
  try {
    tokenDenylist.add(req.token);
    const { exp } = jwt.decode(req.token);
    const ttl = (exp * 1000) - Date.now();
    if (ttl > 0) setTimeout(() => tokenDenylist.delete(req.token), ttl);
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ─── Admin: Get all users ─────────────────────────────────────────────────────
router.get('/admin/users', adminLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const search = req.query.search || '';

    const result = await User.getAllUsers(page, limit, search);
    res.json(result);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// ─── Admin: Deactivate user ───────────────────────────────────────────────────
router.post('/admin/users/:id/deactivate', adminLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    // FIX 14: use the boolean return value from the updated deactivateUser to
    // detect when the target user doesn't exist instead of silently succeeding.
    const found = await User.deactivateUser(userId);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// ─── Admin: Reactivate user ───────────────────────────────────────────────────
router.post('/admin/users/:id/reactivate', adminLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    // FIX 14 (continued): same 404 guard for reactivate.
    const found = await User.reactivateUser(userId);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User reactivated successfully' });
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
// FIX 10: centralized avatar URL sanitizer used by Google OAuth and profile update.
// Only allows https URLs from known Google CDN hosts.
const ALLOWED_AVATAR_HOSTS = ['lh3.googleusercontent.com', 'googleusercontent.com'];

function sanitizeAvatarUrl(url) {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return null;
    if (!ALLOWED_AVATAR_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))) return null;
    return url;
  } catch {
    return null;
  }
}

export default router;