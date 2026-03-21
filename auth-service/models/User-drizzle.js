import bcrypt from 'bcryptjs';
import { db } from '../database-drizzle.js';
import { users } from './schema.js';
import { eq, ilike, or, sql } from 'drizzle-orm';

export class User {
  static async create(userData) {
    const { name, email, password, googleId } = userData;

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    try {
      const [user] = await db.insert(users).values({
        name,
        email,
        password: hashedPassword,
        googleId,
        // FIX 1 (line 20): simplified boolean expression
        verified: Boolean(googleId),
      }).returning();

      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }
  }

  // FIX 2 (lines 32-40): findByEmail now explicitly excludes the password column.
  // Previously it ran db.select() which returns ALL columns including the hashed
  // password — leaking it into duplicate-check logic and anywhere this method's
  // result was forwarded to a response.
  static async findByEmail(email) {
    try {
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          googleId: users.googleId,
          avatar: users.avatar,
          preferences: users.preferences,
          verified: users.verified,
          isActive: users.isActive,
          isAdmin: users.isAdmin,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return user || null;
    } catch (error) {
      console.error('❌ Error finding user by email:', error);
      throw error;
    }
  }

  // FIX 3 (lines 42-49): findByEmailWithPassword intentionally fetches ALL columns
  // (including password) — this is only used internally during login to compare
  // the submitted password against the stored hash. Never return this result
  // directly to a client.
  static async findByEmailWithPassword(email) {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return user || null;
    } catch (error) {
      console.error('❌ Error finding user by email with password:', error);
      throw error;
    }
  }

  static async findByGoogleId(googleId) {
    try {
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          googleId: users.googleId,
          avatar: users.avatar,
          preferences: users.preferences,
          verified: users.verified,
          isActive: users.isActive,
          isAdmin: users.isAdmin,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.googleId, googleId))
        .limit(1);
      return user || null;
    } catch (error) {
      console.error('❌ Error finding user by Google ID:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
          preferences: users.preferences,
          verified: users.verified,
          isActive: users.isActive,
          isAdmin: users.isAdmin,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return user || null;
    } catch (error) {
      console.error('❌ Error finding user by ID:', error);
      throw error;
    }
  }

  static async updateProfile(id, updateData) {
    const { name, avatar, preferences } = updateData;

    try {
      const [user] = await db
        .update(users)
        .set({
          ...(name && { name }),
          ...(avatar && { avatar }),
          ...(preferences && { preferences }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
          preferences: users.preferences,
          verified: users.verified,
          isAdmin: users.isAdmin,
          updatedAt: users.updatedAt,
        });

      return user;
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      throw error;
    }
  }

  static async changePassword(id, currentPassword, newPassword) {
    const [userWithPassword] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!userWithPassword) {
      const error = new Error('User not found');
      error.name = 'UserNotFoundError';
      throw error;
    }

    if (!userWithPassword.password) {
      const error = new Error('Please use Google OAuth to login');
      error.name = 'InvalidPasswordError';
      throw error;
    }

    const isValidPassword = await bcrypt.compare(currentPassword, userWithPassword.password);
    if (!isValidPassword) {
      const error = new Error('Current password is incorrect');
      error.name = 'InvalidPasswordError';
      throw error;
    }

    // FIX 4 (line ~145): prevent password reuse — reject if new password is
    // identical to the current one. Without this check a user can "change"
    // their password to the same value, which is a UX bug and a weak security
    // signal (e.g. after a forced-reset flow).
    const isSamePassword = await bcrypt.compare(newPassword, userWithPassword.password);
    if (isSamePassword) {
      const error = new Error('New password must be different from the current password');
      error.name = 'InvalidPasswordError';
      throw error;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    try {
      await db
        .update(users)
        .set({ password: hashedNewPassword, updatedAt: new Date() })
        .where(eq(users.id, id));
      return true;
    } catch (error) {
      console.error('❌ Error changing password:', error);
      throw error;
    }
  }

  static async linkGoogleId(userId, googleId) {
    try {
      const [user] = await db
        .update(users)
        .set({
          googleId,
          // FIX 5 (line ~162): also mark the account as verified when linking
          // a Google ID, since Google has already verified the email address.
          verified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
          preferences: users.preferences,
          verified: users.verified,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      return user;
    } catch (error) {
      console.error('❌ Error linking Google ID:', error);
      throw error;
    }
  }

  static async comparePassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }

  // FIX 6 (lines 194-202): updateLastLogin was only setting updatedAt, never
  // the actual lastLogin column. The column was added in migration 0002 but has
  // always been NULL in every row because of this bug.
  static async updateLastLogin(id) {
    try {
      await db
        .update(users)
        .set({
          lastLogin: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      return true;
    } catch (error) {
      console.error('❌ Error updating last login:', error);
      throw error;
    }
  }

  static async verifyEmail(email) {
    try {
      await db
        .update(users)
        .set({ verified: true, updatedAt: new Date() })
        .where(eq(users.email, email));

      return true;
    } catch (error) {
      console.error('❌ Error verifying email:', error);
      throw error;
    }
  }

  static async updatePreferences(id, preferences) {
    try {
      const [user] = await db
        .update(users)
        .set({
          preferences,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
          preferences: users.preferences,
          verified: users.verified,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      return user;
    } catch (error) {
      console.error('❌ Error updating preferences:', error);
      throw error;
    }
  }

  // FIX 7 (lines 230-260): the count query did not apply the search filter,
  // so pagination totals were always based on ALL users even when a search term
  // was supplied. This caused wrong page counts and made the admin UI think
  // there were more pages than actually existed.
  static async getAllUsers(page = 1, limit = 10, search = '') {
    try {
      const offset = (page - 1) * limit;

      const searchFilter = search
        ? or(
            ilike(users.name, `%${search}%`),
            ilike(users.email, `%${search}%`)
          )
        : undefined;

      const dataQuery = db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
          preferences: users.preferences,
          verified: users.verified,
          isActive: users.isActive,
          isAdmin: users.isAdmin,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .orderBy(users.createdAt)
        .limit(limit)
        .offset(offset);

      const countQuery = db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(users);

      if (searchFilter) {
        dataQuery.where(searchFilter);
        countQuery.where(searchFilter);
      }

      const [allUsers, [{ count }]] = await Promise.all([dataQuery, countQuery]);
      const total = count;

      return {
        users: allUsers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('❌ Error getting all users:', error);
      throw error;
    }
  }

  // FIX 8 (lines 262-280): deactivateUser and reactivateUser had no guard to
  // prevent operating on a non-existent user — they silently succeeded with
  // 0 rows updated. Now they return false so callers can return a 404.
  static async deactivateUser(id) {
    try {
      const result = await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id });

      return result.length > 0;
    } catch (error) {
      console.error('❌ Error deactivating user:', error);
      throw error;
    }
  }

  static async reactivateUser(id) {
    try {
      const result = await db
        .update(users)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id });

      return result.length > 0;
    } catch (error) {
      console.error('❌ Error reactivating user:', error);
      throw error;
    }
  }
}