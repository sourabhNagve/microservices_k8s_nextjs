import { db } from './database-drizzle.js';
import { warehouses, inventory, inventoryTransactions } from './models/schema.js';
import { eq } from 'drizzle-orm';

// Database products with their UUIDs
const databaseProducts = [
  { id: 'a4f9150a-907c-4c3d-bc56-d0036e449180', name: 'Laptop Pro 15"', sku: 'LAP-PRO-15', stock: 25 },
  { id: 'e31fa193-6119-401a-a2b7-51f38dbabde1', name: 'Wireless Mouse', sku: 'MOU-WIR-01', stock: 100 },
  { id: 'bb31b47d-2e50-4a42-8f49-88a4c8f81b13', name: 'Cotton T-Shirt', sku: 'TSH-COT-001', stock: 50 },
  { id: '9e3ba89f-b8ea-472b-8ba7-c4e9bb2d4247', name: 'JavaScript Guide', sku: 'BOO-JS-001', stock: 30 },
  { id: '9f461db1-39d3-4ade-abae-d1c6054069c4', name: 'Garden Tool Set', sku: 'GAR-TOOL-10', stock: 15 },
  { id: '16cdd934-366c-4c67-b739-93bdb172024f', name: 'Yoga Mat', sku: 'YOG-MAT-001', stock: 40 },
  { id: 'b615d24b-7b8f-403e-a8af-79a56326e2d8', name: 'Smartphone X', sku: 'PHN-X-001', stock: 20 },
  { id: 'c06e2b6c-5d3e-4a39-a47f-58048c3cc2d3', name: 'Denim Jeans', sku: 'JEA-DEN-001', stock: 35 },
  { id: 'eeddc5c9-62c8-4be4-895c-4ad35e44eb0c', name: 'Python Cookbook', sku: 'BOO-PY-001', stock: 25 },
  { id: 'f32b8376-4fa8-4e8c-8f4c-163f4a8992fb', name: 'Running Shoes', sku: 'SHO-RUN-001', stock: 30 }
];

// Sample warehouses
const warehouseData = [
  { name: 'Main Warehouse', location: '123 Storage St, City, State 12345', capacity: 5000, manager: 'John Smith' },
  { name: 'East Coast Facility', location: '456 Logistics Ave, New York, NY 10001', capacity: 3000, manager: 'Sarah Johnson' },
  { name: 'West Coast Hub', location: '789 Supply Rd, Los Angeles, CA 90001', capacity: 4000, manager: 'Mike Wilson' }
];

async function seedInventory() {
  try {
    console.log('🌱 Starting inventory seeding for database products...');
    
    // Clear existing inventory records
    console.log('🗑️  Clearing existing inventory records...');
    await db.delete(inventoryTransactions);
    await db.delete(inventory);
    await db.delete(warehouses);
    
    // Insert warehouses
    console.log('📦 Inserting warehouses...');
    const insertedWarehouses = [];
    for (const warehouse of warehouseData) {
      const [result] = await db.insert(warehouses).values(warehouse).returning();
      insertedWarehouses.push(result);
      console.log(`✅ Created warehouse: ${result.name}`);
    }
    
    // Insert inventory records for each product
    console.log('📦 Inserting inventory records...');
    for (const product of databaseProducts) {
      // Distribute stock across warehouses
      const stockPerWarehouse = Math.floor(product.stock / insertedWarehouses.length);
      const remainingStock = product.stock % insertedWarehouses.length;
      
      for (let i = 0; i < insertedWarehouses.length; i++) {
        const warehouse = insertedWarehouses[i];
        const quantity = stockPerWarehouse + (i === 0 ? remainingStock : 0); // Add remainder to first warehouse
        
        await db.insert(inventory).values({
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: quantity,
          minStock: Math.max(5, Math.floor(quantity * 0.2)), // min stock = 20% of quantity or 5
          maxStock: quantity * 2, // max stock = 2x current quantity
          location: `Aisle ${i + 1}, Rack ${Math.floor(Math.random() * 10) + 1}`
        });
      }
      
      console.log(`✅ Created inventory for ${product.name} (${product.sku}) - Total stock: ${product.stock}`);
    }
    
    console.log('🎉 Inventory seeding completed successfully!');
    
    // Verify the data
    const inventoryCount = await db.select().from(inventory);
    console.log(`📊 Total inventory records created: ${inventoryCount.length}`);
    
  } catch (error) {
    console.error('❌ Error seeding inventory:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

seedInventory();
