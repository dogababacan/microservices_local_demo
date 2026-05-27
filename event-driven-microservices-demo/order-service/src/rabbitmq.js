const amqp = require("amqplib");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE_NAME = "ecommerce_events";

let channel;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry() {
  while (true) {
    try {
      console.log("[Order Service] Connecting to RabbitMQ...");

      const connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createConfirmChannel();

      // assertExchange declares the notice board area where event notes are posted.
      await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
      channel.prefetch(1);

      console.log("[Order Service] Connected to RabbitMQ");
      return channel;
    } catch (error) {
      console.error("[Order Service] RabbitMQ not ready yet. Retrying in 5 seconds...");
      await wait(5000);
    }
  }
}

async function publishEvent(routingKey, event) {
  if (!channel) {
    throw new Error("RabbitMQ channel is not ready");
  }

  return new Promise((resolve, reject) => {
    // publish posts a note to the notice board with a routing-key label.
    channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(JSON.stringify(event)), {
      contentType: "application/json",
      persistent: true,
    }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function consumeEvents(queueName, routingKeys, handler) {
  if (!channel) {
    throw new Error("RabbitMQ channel is not ready");
  }

  await channel.assertQueue(queueName, { durable: true });

  for (const routingKey of routingKeys) {
    await channel.bindQueue(queueName, EXCHANGE_NAME, routingKey);
  }

  channel.consume(queueName, async (msg) => {
    if (!msg) {
      return;
    }

    let event;

    try {
      event = JSON.parse(msg.content.toString());
    } catch (error) {
      console.error("[Order Service] Invalid JSON message", error.message);
      channel.nack(msg, false, false);
      return;
    }

    try {
      await handler(event);
      channel.ack(msg);
    } catch (error) {
      console.error("[Order Service] Error while processing message", error.message);
      channel.nack(msg, false, true);
    }
  });
}

module.exports = {
  connectWithRetry,
  publishEvent,
  consumeEvents,
};
