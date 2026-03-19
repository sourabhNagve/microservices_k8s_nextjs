import amqp from 'amqplib';

let connection = null;
let channel    = null;

export const connectRabbitMQ = async () => {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672/';
  connection = await amqp.connect(url);
  channel    = await connection.createChannel();

  await channel.assertQueue('order.created',  { durable: true });
  await channel.assertQueue('order.shipped',  { durable: true });
  await channel.assertQueue('order.delivered',{ durable: true });
  await channel.assertQueue('order.cancelled',{ durable: true });

  console.log('✅ Notification service connected to RabbitMQ');
  return { connection, channel };
};

export const consumeFromQueue = async (queueName, callback) => {
  if (!channel) await connectRabbitMQ();

  await channel.consume(queueName, async (msg) => {
    if (!msg) return;
    try {
      const content = JSON.parse(msg.content.toString());
      console.log(`📨 [${queueName}] received:`, content.orderId ?? content);
      await callback(content);
      channel.ack(msg);
    } catch (err) {
      console.error(`❌ [${queueName}] processing error:`, err);
      channel.nack(msg, false, false); // discard — don't requeue forever
    }
  }, { noAck: false });

  console.log(`✅ Consuming from queue: ${queueName}`);
};

process.on('SIGINT',  async () => { await channel?.close(); await connection?.close(); process.exit(0); });
process.on('SIGTERM', async () => { await channel?.close(); await connection?.close(); process.exit(0); });