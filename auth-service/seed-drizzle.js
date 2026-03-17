import bcrypt from 'bcryptjs';
import { db } from './database-drizzle.js';
import { users } from './models/schema.js';
import { eq } from 'drizzle-orm';

export const seedUsers = async () => {
  console.log('🌱 Starting user seeding...');
  
  try {
    // Clear existing users
    await db.delete(users);
    
    // Create test users
    const testUsers = [
      {
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'admin123',
        verified: true,
        preferences: { theme: 'dark', notifications: true }
      },
      {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'user123',
        verified: true,
        preferences: { theme: 'light', notifications: false }
      },
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        password: 'user123',
        verified: true,
        preferences: { theme: 'light', notifications: true }
      },
      {
        name: 'Test User',
        email: 'test@example.com',
        password: 'user123',
        verified: false,
        preferences: { theme: 'light', notifications: false }
      }
    ];

    for (const userData of testUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      await db.insert(users).values({
        ...userData,
        password: hashedPassword,
      });
    }

    console.log('✅ Users seeded successfully!');
    console.log('📧 Test accounts:');
    console.log('   admin@example.com / admin123 (Admin)');
    console.log('   john@example.com / user123 (User)');
    console.log('   jane@example.com / user123 (User)');
    console.log('   test@example.com / user123 (User - unverified)');
    
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedUsers().catch(console.error);
}
