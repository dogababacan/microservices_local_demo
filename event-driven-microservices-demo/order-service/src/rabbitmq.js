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

module.exports = {
  connectWithRetry,
  publishEvent,
};
