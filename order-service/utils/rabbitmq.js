import amqp from 'amqplib';

let connection = null;
let channel    = null;
let isShuttingDown = false;

// FIX 1: queue names as a constant so they are defined in one place and
// shared between connectRabbitMQ (assertQueue) and publishToQueue (validation).
export const QUEUES = [
  'order.created',
  'order.payment.processing',
  'order.payment.completed',
  'order.payment.failed',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
];

export const connectRabbitMQ = async () => {
  const rabbitmqUrl = process.env.RABBITMQ_URL;
  if (!rabbitmqUrl) {
    throw new Error('RABBITMQ_URL environment variable must be set');
  }

  // FIX 2 (original lines 14-19): the original only created a new connection
  // if connection was null, but it never checked whether the existing connection
  // was still open. After a broker restart the stale connection reference is
  // truthy but unusable — publishToQueue would fail with a confusing error.
  // Now always close stale connections before reconnecting.
  if (connection) {
    try {
      await connection.close();
    } catch {
      // Ignore errors when closing a dead connection
    }
    connection = null;
    channel    = null;
  }

  console.log('🔗 Attempting to connect to RabbitMQ...');
  connection = await amqp.connect(rabbitmqUrl);
  console.log('✅ Connected to RabbitMQ');

  // FIX 3: listen for connection-level errors and unexpected closes so the
  // module-level references are cleared. Without this, a broker restart leaves
  // stale references and every subsequent publishToQueue silently fails or
  // throws a cryptic "socket closed" error.
  connection.on('error', (err) => {
    console.error('❌ RabbitMQ connection error:', err.message);
    connection = null;
    channel    = null;
  });

  connection.on('close', () => {
    if (!isShuttingDown) {
      console.warn('⚠️  RabbitMQ connection closed unexpectedly — references cleared');
    }
    connection = null;
    channel    = null;
  });

  channel = await connection.createChannel();
  console.log('✅ RabbitMQ channel created');

  // FIX 4: set prefetch(1) so the consumer processes one message at a time
  // and does not get overwhelmed if the queue backs up.
  await channel.prefetch(1);

  channel.on('error', (err) => {
    console.error('❌ RabbitMQ channel error:', err.message);
    channel = null;
  });

  channel.on('close', () => {
    if (!isShuttingDown) {
      console.warn('⚠️  RabbitMQ channel closed unexpectedly');
    }
    channel = null;
  });

  for (const q of QUEUES) {
    await channel.assertQueue(q, { durable: true });
  }
  console.log('✅ RabbitMQ queues declared');

  return { connection, channel };
};

export const publishToQueue = async (queueName, message) => {
  // FIX 5: validate the queue name against the known list so a typo in a
  // status string (e.g. `order.canceld`) does not silently create an undeclared
  // queue and lose the message.
  if (!QUEUES.includes(queueName)) {
    throw new Error(`Unknown queue: '${queueName}'. Valid queues: ${QUEUES.join(', ')}`);
  }

  // FIX 6 (original lines 44-47): if channel was null the original attempted
  // a reconnect, but if connectRabbitMQ failed (broker is down) it threw
  // and the error propagated to the order creation transaction. Now we attempt
  // reconnect but surface a clear error rather than a confusing channel error.
  if (!channel) {
    try {
      await connectRabbitMQ();
    } catch (reconnErr) {
      throw new Error(`RabbitMQ unavailable — could not publish to ${queueName}: ${reconnErr.message}`);
    }
  }

  const messageBuffer = Buffer.from(JSON.stringify(message));

  // FIX 7 (original line 50): channel.sendToQueue returns false when the
  // channel's write buffer is full (backpressure). The original logged a
  // warning but returned false silently. Now we throw so callers know the
  // message was not queued.
  const sent = channel.sendToQueue(queueName, messageBuffer, {
    persistent:  true,
    contentType: 'application/json',
    // FIX 8: timestamp lets consumers and dead-letter queues reason about
    // message age without needing to parse the payload.
    timestamp:   Math.floor(Date.now() / 1000),
  });

  if (!sent) {
    throw new Error(`Channel write buffer full — message to ${queueName} was NOT queued`);
  }

  return true;
};

export const consumeFromQueue = async (queueName, callback) => {
  if (!QUEUES.includes(queueName)) {
    throw new Error(`Unknown queue: '${queueName}'`);
  }

  if (!channel) {
    await connectRabbitMQ();
  }

  await channel.consume(queueName, async (message) => {
    if (!message) return;

    let content;
    try {
      content = JSON.parse(message.content.toString());
    } catch (parseErr) {
      console.error(`❌ Unparseable message from ${queueName} — dead-lettering:`, parseErr.message);
      // FIX 9 (original): nack with requeue=false so a malformed message is
      // not put back into the queue where it would loop forever.
      channel.nack(message, false, false);
      return;
    }

    try {
      // FIX 10 (original lines 67-73): the original called callback() and
      // immediately ack'd. If callback threw after the ack, the message was
      // lost. Now we await the callback before ack'ing so the message is only
      // acknowledged after successful processing.
      await callback(content);
      channel.ack(message);
    } catch (callbackErr) {
      console.error(`❌ Callback error for message from ${queueName}:`, callbackErr.message);
      // Nack without requeue — send to dead-letter exchange if configured,
      // otherwise discard. Change requeue to true if idempotent retry is safe.
      channel.nack(message, false, false);
    }
  }, { noAck: false });

  console.log(`✅ Consuming from queue ${queueName}`);
};

export const closeConnection = async () => {
  isShuttingDown = true;
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
    console.error('❌ Error closing RabbitMQ connection:', error.message);
  }
};

// FIX 11 (original): SIGTERM was not handled — Docker/K8s stop signals left
// the AMQP connection open until the broker's heartbeat timeout fired.
process.on('SIGINT',  closeConnection);
process.on('SIGTERM', closeConnection);