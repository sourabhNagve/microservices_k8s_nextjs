import { db } from './database-drizzle.js';
import { inventory, warehouses } from './models/schema.js';

// Sample inventory data
const sampleWarehouses = [
  { id: 1, name: 'Main Warehouse', location: 'New York', active: true },
  { id: 2, name: 'West Coast Warehouse', location: 'Los Angeles', active: true },
  { id: 3, name: 'European Warehouse', location: 'Amsterdam', active: true }
];

const sampleInventory = [
  // Wireless Headphones
  { productId: 'prod-1', warehouseId: 1, quantity: 30, reserved: 5, minStock: 10, maxStock: 100 },
  { productId: 'prod-1', warehouseId: 2, quantity: 20, reserved: 3, minStock: 10, maxStock: 100 },
  
  // Laptop Stand
  { productId: 'prod-2', warehouseId: 1, quantity: 15, reserved: 2, minStock: 5, maxStock: 50 },
  { productId: 'prod-2', warehouseId: 3, quantity: 10, reserved: 1, minStock: 5, maxStock: 50 },
  
  // Mechanical Keyboard
  { productId: 'prod-3', warehouseId: 1, quantity: 25, reserved: 4, minStock: 8, maxStock: 75 },
  { productId: 'prod-3', warehouseId: 2, quantity: 18, reserved: 2, minStock: 8, maxStock: 75 },
  
  // USB-C Hub
  { productId: 'prod-4', warehouseId: 1, quantity: 40, reserved: 8, minStock: 15, maxStock: 120 },
  { productId: 'prod-4', warehouseId: 3, quantity: 35, reserved: 6, minStock: 15, maxStock: 120 },
  
  // Monitor Stand
  { productId: 'prod-5', warehouseId: 1, quantity: 12, reserved: 1, minStock: 5, maxStock: 40 },
  { productId: 'prod-5', warehouseId: 2, quantity: 8, reserved: 0, minStock: 5, maxStock: 40 },
  
  // Wireless Mouse
  { productId: 'prod-6', warehouseId: 1, quantity: 45, reserved: 7, minStock: 20, maxStock: 150 },
  { productId: 'prod-6', warehouseId: 3, quantity: 38, reserved: 5, minStock: 20, maxStock: 150 }
];

export const seedInventory = async () => {
  console.log('🌱 Starting inventory seeding...');
  
  try {
    // Clear existing data
    await db.delete(inventory);
    await db.delete(warehouses);
    
    // Insert warehouses
    for (const warehouse of sampleWarehouses) {
      await db.insert(warehouses).values(warehouse);
    }
    console.log('✅ Warehouses seeded');
    
    // Insert inventory
    for (const item of sampleInventory) {
      await db.insert(inventory).values({
        ...item,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    console.log('✅ Inventory seeded');
    
    // Show summary
    const inventoryCount = await db.select().from(inventory);
    console.log(`📊 Seeded ${inventoryCount.length} inventory records`);
    
    // Show available stock by product
    const productStock = {};
    inventoryCount.forEach(item => {
      if (!productStock[item.productId]) {
        productStock[item.productId] = { total: 0, available: 0 };
      }
      productStock[item.productId].total += item.quantity;
      productStock[item.productId].available += (item.quantity - item.reserved);
    });
    
    console.log('\n📦 Product Stock Summary:');
    Object.entries(productStock).forEach(([productId, stock]) => {
      console.log(`   ${productId}: ${stock.available} available (${stock.total} total)`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding inventory:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedInventory().catch(console.error);
}
