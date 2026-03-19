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
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not defined');
if (!process.env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is not defined');

// ─── Google client ────────────────────────────────────────────────────────────
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many requests, please try again later' },
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ✅ slice(7) instead of replace('Bearer ', '') — avoids replacing
  // 'Bearer ' if it somehow appears elsewhere in the token string
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
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
const requireAdmin = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.currentUser = currentUser;
    next();
  } catch (error) {
    next(error);
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

    if (!user.password) {
      return res.status(401).json({ error: 'Please use Google OAuth to login' });
    }

    const isPasswordValid = await User.comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await User.updateLastLogin(user.id);

    const { password: _pw, ...safeUser } = user;

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
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
        isAdmin:  safeUser.isAdmin ?? safeUser.is_admin ?? false, // ✅ add fallback
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
    const googleUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };

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

    await User.updateLastLogin(user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Google authentication successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || googleUser.picture,
        verified: user.verified,
        isAdmin:  user.isAdmin ?? user.is_admin ?? false,
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
        isAdmin:  user.isAdmin ?? user.is_admin ?? false,
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
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error.name === 'InvalidPasswordError') {
      return res.status(400).json({ error: 'Current password is incorrect' });
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
router.post('/logout', authenticate, async (req, res) => {
  try {
    // TODO: add token to Redis blacklist for true stateless invalidation
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
    await User.deactivateUser(userId);
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
    await User.reactivateUser(userId);
    res.json({ message: 'User reactivated successfully' });
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

export default router;