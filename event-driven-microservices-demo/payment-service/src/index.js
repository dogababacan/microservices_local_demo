const express = require("express");
const { connectWithRetry, consumeEvent, publishEvent } = require("./rabbitmq");

const app = express();
const PORT = process.env.PORT || 3003;

const QUEUE_NAME = "payment_service_inventory_reserved_queue";

app.use(express.json());

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createEvent(eventType, correlationId, data) {
  return {
    eventId: createId("evt"),
    eventType,
    occurredAt: new Date().toISOString(),
    correlationId,
    data,
  };
}

app.get("/health", (req, res) => {
  res.json({
    service: "payment-service",
    status: "ok",
  });
});

async function handleInventoryReserved(event) {
  const { correlationId, data } = event;

  console.log(`[Payment Service] [${correlationId}] Received event: inventory.reserved`);

  // Payment Service subscribes to inventory.reserved notes because payment
  // should only be attempted after the product has been reserved.
  if (data.userId === "fail-payment") {
    console.log(`[Payment Service] [${correlationId}] Payment failed`);

    const paymentFailedEvent = createEvent("payment.failed", correlationId, {
      ...data,
      reason: "Simulated payment failure",
    });

    await publishEvent("payment.failed", paymentFailedEvent);

    console.log(`[Payment Service] [${correlationId}] Published event: payment.failed`);
    return;
  }

  console.log(`[Payment Service] [${correlationId}] Payment completed`);

  const paymentCompletedEvent = createEvent("payment.completed", correlationId, {
    ...data,
    paymentId: createId("pay"),
  });

  await publishEvent("payment.completed", paymentCompletedEvent);

  console.log(`[Payment Service] [${correlationId}] Published event: payment.completed`);
}

async function start() {
  await connectWithRetry();
  await consumeEvent(QUEUE_NAME, "inventory.reserved", handleInventoryReserved);

  app.listen(PORT, () => {
    console.log(`[Payment Service] Listening on port ${PORT}`);
    console.log(`[Payment Service] Waiting for inventory.reserved events`);
  });
}

start();
