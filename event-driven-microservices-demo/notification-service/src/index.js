const express = require("express");
const { connectWithRetry, consumeEvents } = require("./rabbitmq");

const app = express();
const PORT = process.env.PORT || 3004;

const QUEUE_NAME = "notification_service_events_queue";
const ROUTING_KEYS = ["payment.completed", "payment.failed", "inventory.failed"];

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    service: "notification-service",
    status: "ok",
  });
});

async function handleNotificationEvent(event) {
  const { eventType, correlationId, data } = event;

  // Notification Service has one service inbox subscribed to three note labels.
  // Producers do not need to know that notifications exist.
  console.log(`[Notification Service] [${correlationId}] Received event: ${eventType}`);

  if (eventType === "payment.completed") {
    console.log(`[Notification Service] [${correlationId}] Notification: Order ${data.orderId} confirmed`);
    return;
  }

  if (eventType === "payment.failed") {
    console.log(`[Notification Service] [${correlationId}] Notification: Payment failed. Please try again.`);
    return;
  }

  if (eventType === "inventory.failed") {
    console.log(`[Notification Service] [${correlationId}] Notification: Product is out of stock.`);
    return;
  }

  console.log(`[Notification Service] [${correlationId}] Notification: Unknown event type ${eventType}`);
}

async function start() {
  await connectWithRetry();
  await consumeEvents(QUEUE_NAME, ROUTING_KEYS, handleNotificationEvent);

  app.listen(PORT, () => {
    console.log(`[Notification Service] Listening on port ${PORT}`);
    console.log(`[Notification Service] Waiting for payment.completed, payment.failed, and inventory.failed events`);
  });
}

start();
