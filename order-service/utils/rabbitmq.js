import amqp from 'amqplib';

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
  try {
    const rabbitmqUrl = process.env.RABBITMQ_URL;
    if (!rabbitmqUrl) {
      throw new Error('RABBITMQ_URL environment variable must be set');
    }
    console.log('🔗 Attempting to connect to RabbitMQ...');
    
    if (!connection) {
      connection = await amqp.connect(rabbitmqUrl);
      console.log('✅ Connected to RabbitMQ');
    }
    
    if (!channel) {
      channel = await connection.createChannel();
      console.log('✅ RabbitMQ channel created');
    }
    
    // Declare queues
    await channel.assertQueue('order.created', { durable: true });
    await channel.assertQueue('order.payment.processing', { durable: true });
    await channel.assertQueue('order.payment.completed', { durable: true });
    await channel.assertQueue('order.payment.failed', { durable: true });
    await channel.assertQueue('order.shipped', { durable: true });
    await channel.assertQueue('order.delivered', { durable: true });
    await channel.assertQueue('order.cancelled', { durable: true });
    
    console.log('✅ RabbitMQ queues declared');
    
    return { connection, channel };
  } catch (error) {
    console.error('❌ RabbitMQ connection error:', error);
    throw error;
  }
};

const publishToQueue = async (queueName, message) => {
  try {
    if (!channel) {
      await connectRabbitMQ();
    }
    
    const messageBuffer = Buffer.from(JSON.stringify(message));
    const sent = channel.sendToQueue(queueName, messageBuffer, { persistent: true });
    
    if (sent) {
      console.log(`✅ Message sent to queue ${queueName}, orderId: ${message.orderId}`);
    } else {
      console.log(`⚠️ Message not sent to queue ${queueName}`);
    }
    
    return sent;
  } catch (error) {
    console.error(`❌ Error publishing to queue ${queueName}:`, error);
    throw error;
  }
};

const consumeFromQueue = async (queueName, callback) => {
  try {
    if (!channel) {
      await connectRabbitMQ();
    }
    
    await channel.consume(queueName, (message) => {
      if (message) {
        try {
          const content = JSON.parse(message.content.toString());
          console.log(`📨 Received message from queue ${queueName}:`, content);
          callback(content);
          channel.ack(message);
        } catch (error) {
          console.error(`❌ Error processing message from queue ${queueName}:`, error);
          channel.nack(message, false, false);
        }
      }
    }, { noAck: false });
    
    console.log(`✅ Started consuming from queue ${queueName}`);
  } catch (error) {
    console.error(`❌ Error consuming from queue ${queueName}:`, error);
    throw error;
  }
};

const closeConnection = async () => {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    
    if (connection) {
      await connection.close();
      connection = null;
    }
    
    console.log('✅ RabbitMQ connection closed');
  } catch (error) {
    console.error('❌ Error closing RabbitMQ connection:', error);
  }
};

// Handle graceful shutdown
process.on('SIGINT', closeConnection);
process.on('SIGTERM', closeConnection);

export {
  connectRabbitMQ,
  publishToQueue,
  consumeFromQueue,
  closeConnection
};
