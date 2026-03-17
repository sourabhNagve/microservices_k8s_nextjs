import { db } from './database-drizzle.js';
import { categories, products } from './models/schema.js';

export const seedProducts = async () => {
  console.log('🌱 Starting product seeding...');
  
  try {
    // Clear existing data
    await db.delete(products);
    await db.delete(categories);
    
    // Create categories
    const categoryData = [
      { name: 'Electronics', description: 'Electronic devices and gadgets' },
      { name: 'Clothing', description: 'Apparel and fashion items' },
      { name: 'Books', description: 'Books and educational materials' },
      { name: 'Home & Garden', description: 'Home improvement and garden supplies' },
      { name: 'Sports', description: 'Sports equipment and gear' },
    ];

    const createdCategories = await db.insert(categories).values(categoryData).returning();
    console.log('✅ Categories created:', createdCategories.length);

    // Create products
    const productData = [
      {
        name: 'Laptop Pro 15"',
        description: 'High-performance laptop with 15-inch display, Intel i7 processor, 16GB RAM',
        price: '1299.99',
        categoryId: createdCategories[0].id,
        sku: 'LAP-PRO-15',
        stock: 25,
        images: [
          'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Wireless Mouse',
        description: 'Ergonomic wireless mouse with precision tracking and long battery life',
        price: '29.99',
        categoryId: createdCategories[0].id,
        sku: 'MOU-WIR-01',
        stock: 100,
        images: [
          'https://images.unsplash.com/photo-1527864550417-7fd405520b1c?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1615461066159-1027d84d9171?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Cotton T-Shirt',
        description: 'Comfortable 100% organic cotton t-shirt, available in multiple colors',
        price: '19.99',
        categoryId: createdCategories[1].id,
        sku: 'TSH-COT-001',
        stock: 50,
        images: [
          'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1562157873-8bc3c35a91ae?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'JavaScript Guide',
        description: 'Complete guide to JavaScript programming with modern ES6+ features',
        price: '39.99',
        categoryId: createdCategories[2].id,
        sku: 'BOO-JS-001',
        stock: 30,
        images: [
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1589998054513-2b8716d5d2c0?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Garden Tool Set',
        description: 'Complete garden tool set with 10 pieces, ergonomic handles',
        price: '89.99',
        categoryId: createdCategories[3].id,
        sku: 'GAR-TOOL-10',
        stock: 15,
        images: [
          'https://images.unsplash.com/photo-1585420336284-11d7e8798a92?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1585829368292-7f6f8a7c9e73?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Yoga Mat',
        description: 'Non-slip exercise yoga mat, 6mm thick with carrying strap',
        price: '24.99',
        categoryId: createdCategories[4].id,
        sku: 'YOG-MAT-001',
        stock: 40,
        images: [
          'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Smartphone X',
        description: 'Latest smartphone with advanced camera system and 5G connectivity',
        price: '899.99',
        categoryId: createdCategories[0].id,
        sku: 'PHN-X-001',
        stock: 20,
        images: [
          'https://images.unsplash.com/photo-1511707171634-a9830435a8eb?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1592728391302-7dc1b9cc8921?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Denim Jeans',
        description: 'Classic fit denim jeans with premium quality fabric',
        price: '59.99',
        categoryId: createdCategories[1].id,
        sku: 'JEA-DEN-001',
        stock: 35,
        images: [
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1495385796433-34a62927a071?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Python Cookbook',
        description: 'Python recipes and examples for modern development',
        price: '44.99',
        categoryId: createdCategories[2].id,
        sku: 'BOO-PY-001',
        stock: 25,
        images: [
          'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1620736698954-416219586236?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Running Shoes',
        description: 'Professional running shoes with advanced cushioning technology',
        price: '79.99',
        categoryId: createdCategories[4].id,
        sku: 'SHO-RUN-001',
        stock: 30,
        images: [
          'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1467093963718-39b101a2a2ea?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Tablet Pro',
        description: '10-inch tablet with stylus, perfect for digital art and note-taking',
        price: '499.99',
        categoryId: createdCategories[0].id,
        sku: 'TAB-PRO-10',
        stock: 18,
        images: [
          'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Mechanical Keyboard',
        description: 'RGB mechanical keyboard with blue switches, perfect for gaming',
        price: '89.99',
        categoryId: createdCategories[0].id,
        sku: 'KEY-MEC-001',
        stock: 22,
        images: [
          'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1599003524979-c8c3019d0c6a?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Wireless Headphones',
        description: 'Premium noise-canceling wireless headphones with 30-hour battery',
        price: '149.99',
        categoryId: createdCategories[0].id,
        sku: 'HPN-WIR-001',
        stock: 28,
        images: [
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1546435282-74c5df65a736?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Winter Jacket',
        description: 'Warm and waterproof winter jacket with hood and pockets',
        price: '79.99',
        categoryId: createdCategories[1].id,
        sku: 'JAC-WIN-001',
        stock: 32,
        images: [
          'https://images.unsplash.com/photo-1544968349-0eee8c2d5b87?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1551488830-942c3bb2e3b5?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Coffee Maker',
        description: 'Automatic coffee maker with programmable settings',
        price: '129.99',
        categoryId: createdCategories[3].id,
        sku: 'COF-AUT-001',
        stock: 16,
        images: [
          'https://images.unsplash.com/photo-1495474472287-4d71b4125eb2?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1517668950772-6d6d5cc39a2e?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Fitness Tracker',
        description: 'Advanced fitness tracker with heart rate monitor and GPS',
        price: '69.99',
        categoryId: createdCategories[4].id,
        sku: 'FIT-TRK-001',
        stock: 45,
        images: [
          'https://images.unsplash.com/photo-1575311376930-1c2f2f730fd7?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1558618047-3c8c5a53aebd?w=800&h=600&fit=crop'
        ],
        active: true,
      },
      {
        name: 'Camera Lens',
        description: 'Professional 50mm f/1.8 camera lens for portrait photography',
        price: '299.99',
        categoryId: createdCategories[0].id,
        sku: 'LEN-50MM-001',
        stock: 12,
        images: [
          'https://images.unsplash.com/photo-1596462502278-2fd5358025ee?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1542744175-8e7a5d759dc9?w=800&h=600&fit=crop'
        ],
        active: true,
      }
    ];

    const createdProducts = await db.insert(products).values(productData).returning();
    console.log('✅ Products created:', createdProducts.length);
    console.log('📦 Created', createdCategories.length, 'categories and', createdProducts.length, 'products');
    
  } catch (error) {
    console.error('❌ Error seeding products:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedProducts().catch(console.error);
}
