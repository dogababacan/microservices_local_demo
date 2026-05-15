const express = require("express");
const { connectWithRetry, consumeEvents } = require("./rabbitmq");

const app = express();
const PORT = process.env.PORT || 3005;

const QUEUE_NAME = "analytics_service_events_queue";
const ROUTING_KEYS = [
  "order.created",
  "inventory.reserved",
  "inventory.failed",
  "payment.completed",
  "payment.failed",
];

const METRIC_BY_EVENT_TYPE = {
  "order.created": "checkout_started",
  "inventory.reserved": "inventory_reserved",
  "inventory.failed": "checkout_failed_out_of_stock",
  "payment.completed": "checkout_completed",
  "payment.failed": "checkout_failed_payment",
};

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    service: "analytics-service",
    status: "ok",
  });
});

async function handleAnalyticsEvent(event) {
  const { eventType, correlationId } = event;
  const metricName = METRIC_BY_EVENT_TYPE[eventType] || "unknown_event";

  // Analytics Service observes notes from the side. It does not publish new notes.
  console.log(`[Analytics Service] [${correlationId}] Received event: ${eventType}`);
  console.log(`[Analytics Service] [${correlationId}] Metric: ${metricName}`);
}

async function start() {
  await connectWithRetry();
  await consumeEvents(QUEUE_NAME, ROUTING_KEYS, handleAnalyticsEvent);

  app.listen(PORT, () => {
    console.log(`[Analytics Service] Listening on port ${PORT}`);
    console.log("[Analytics Service] Teaching point: I can be added without changing Order, Inventory, Payment, or Notification services.");
    console.log("[Analytics Service] Waiting for order.created, inventory.*, and payment.* events");
  });
}

start();
