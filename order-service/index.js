import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load root environment file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import orderRoutes from './routes/order.js';
import { connectDB, initTables } from './database.js';
import { connectRabbitMQ } from './utils/rabbitmq.js';

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT || process.env.PORT || 3006;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'order-service',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/orders', orderRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    await initTables();
    
    // Initialize RabbitMQ connection if available
    try {
      await connectRabbitMQ();
      console.log('✅ RabbitMQ connection established');
    } catch (mqError) {
      console.error('⚠️ Failed to connect to RabbitMQ:', mqError.message);
      console.log('⚠️ Order service will continue without RabbitMQ');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Order service running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
