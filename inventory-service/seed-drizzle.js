import { db } from './database-drizzle.js';
import { warehouses, inventory, inventoryTransactions } from './models/schema.js';
import { v4 as uuidv4 } from 'uuid';

export const seedInventory = async () => {
  console.log('🌱 Starting inventory seeding...');
  
  try {
    // Clear existing data
    await db.delete(inventoryTransactions);
    await db.delete(inventory);
    await db.delete(warehouses);
    
    // Create warehouses
    const warehouseData = [
      {
        name: 'Main Warehouse',
        location: '123 Industrial Ave, City, State',
        capacity: 10000,
        manager: 'John Smith',
        active: true,
      },
      {
        name: 'Secondary Warehouse',
        location: '456 Storage Blvd, City, State',
        capacity: 5000,
        manager: 'Jane Doe',
        active: true,
      },
      {
        name: 'Distribution Center',
        location: '789 Logistics Rd, City, State',
        capacity: 15000,
        manager: 'Mike Johnson',
        active: true,
      },
    ];

    const createdWarehouses = await db.insert(warehouses).values(warehouseData).returning();
    console.log('✅ Warehouses created:', createdWarehouses.length);

    // Create inventory records
    const inventoryData = [];
    const productIds = [
      uuidv4(), uuidv4(), uuidv4(), uuidv4(),
      uuidv4(), uuidv4(), uuidv4(), uuidv4(),
      uuidv4(), uuidv4(), uuidv4()
    ];

    productIds.forEach((productId) => {
      createdWarehouses.forEach((warehouse) => {
        inventoryData.push({
          productId: productId,
          warehouseId: warehouse.id,
          quantity: Math.floor(Math.random() * 100) + 10,
          minStock: 5,
          maxStock: 100,
          location: `Aisle ${Math.floor(Math.random() * 10) + 1}`,
        });
      });
    });

    const createdInventory = await db.insert(inventory).values(inventoryData).returning();
    console.log('✅ Inventory records created:', createdInventory.length);

    // Create sample transactions
    const transactionData = [];
    createdInventory.slice(0, 4).forEach((inv) => {
      transactionData.push({
        inventoryId: inv.id,
        type: 'in',
        quantity: 50,
        reason: 'Initial stock',
        referenceId: 'INIT-' + inv.id,
        performedBy: 'System',
      });
    });

    createdInventory.slice(4, 8).forEach((inv) => {
      transactionData.push({
        inventoryId: inv.id,
        type: 'out',
        quantity: 10,
        reason: 'Customer order',
        referenceId: 'ORDER-' + inv.id,
        performedBy: 'Warehouse Staff',
      });
    });

    const createdTransactions = await db.insert(inventoryTransactions).values(transactionData).returning();
    console.log('✅ Transactions created:', createdTransactions.length);
    
    console.log('📦 Created', createdWarehouses.length, 'warehouses');
    console.log('📊 Created', createdInventory.length, 'inventory records');
    console.log('📝 Created', createdTransactions.length, 'sample transactions');
    
  } catch (error) {
    console.error('❌ Error seeding inventory:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedInventory().catch(console.error);
}
