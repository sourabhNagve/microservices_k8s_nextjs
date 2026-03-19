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
        verified: googleId ? true : false,
      }).returning();

      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return user[0] || null;
    } catch (error) {
      console.error('❌ Error finding user by email:', error);
      throw error;
    }
  }

  static async findByEmailWithPassword(email) {
    try {
      const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return user[0] || null;
    } catch (error) {
      console.error('❌ Error finding user by email with password:', error);
      throw error;
    }
  }

  static async findByGoogleId(googleId) {
    try {
      const user = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
      return user[0] || null;
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
          isAdmin: users.isAdmin,
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
    // get user with password directly by id
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
    return await bcrypt.compare(password, hashedPassword);
  }

  static async updateLastLogin(id) {
    try {
      await db
        .update(users)
        .set({ updatedAt: new Date() })
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

  static async getAllUsers(page = 1, limit = 10, search = '') {
    try {
      const offset = (page - 1) * limit;

      let query = db
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
        .from(users);

      if (search) {
        query = query.where(
          or(
            ilike(users.name, `%${search}%`),
            ilike(users.email, `%${search}%`)
          )
        );
      }

      const allUsers = await query
        .limit(limit)
        .offset(offset)
        .orderBy(users.createdAt);

      // Get total count for pagination — apply the same search filter
      const countQuery = db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(users);

      const filteredCountQuery = search
        ? countQuery.where(
            or(
              ilike(users.name, `%${search}%`),
              ilike(users.email, `%${search}%`)
            )
          )
        : countQuery;

      const [{ count }] = await filteredCountQuery;
      const total = count;

      return {
        users: allUsers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ Error getting all users:', error);
      throw error;
    }
  }

  static async deactivateUser(id) {
    try {
      await db
        .update(users)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      return true;
    } catch (error) {
      console.error('❌ Error deactivating user:', error);
      throw error;
    }
  }

  static async reactivateUser(id) {
    try {
      await db
        .update(users)
        .set({
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      return true;
    } catch (error) {
      console.error('❌ Error reactivating user:', error);
      throw error;
    }
  }
}
