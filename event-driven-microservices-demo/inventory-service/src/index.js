const express = require("express");
const { connectWithRetry, consumeEvent, publishEvent } = require("./rabbitmq");

const app = express();
const PORT = process.env.PORT || 3002;

const QUEUE_NAME = "inventory_service_order_created_queue";

// This stock lives only in memory. It is perfect for teaching, but it resets
// whenever the Inventory Service restarts.
const stock = {
  pencil: 10,
  notebook: 5,
  laptop: 0,
};

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
    service: "inventory-service",
    status: "ok",
  });
});

async function handleOrderCreated(event) {
  const { correlationId, data } = event;
  const { orderId, productId, quantity } = data;

  console.log(`[Inventory Service] [${correlationId}] Received event: order.created`);

  const availableStock = stock[productId] || 0;

  if (availableStock >= quantity) {
    stock[productId] = availableStock - quantity;

    console.log(`[Inventory Service] [${correlationId}] Stock available`);

    const inventoryReservedEvent = createEvent("inventory.reserved", correlationId, {
      ...data,
      reservedQuantity: quantity,
      remainingStock: stock[productId],
    });

    // Inventory Service posts a result note instead of directly calling Payment Service.
    await publishEvent("inventory.reserved", inventoryReservedEvent);

    console.log(`[Inventory Service] [${correlationId}] Published event: inventory.reserved`);
    console.log(`[Inventory Service] [${correlationId}] Remaining ${productId} stock: ${stock[productId]}`);
    return;
  }

  console.log(`[Inventory Service] [${correlationId}] Stock not available for order ${orderId}`);

  const inventoryFailedEvent = createEvent("inventory.failed", correlationId, {
    ...data,
    reason: "Product is out of stock",
    availableStock,
  });

  await publishEvent("inventory.failed", inventoryFailedEvent);

  console.log(`[Inventory Service] [${correlationId}] Published event: inventory.failed`);
}

async function start() {
  await connectWithRetry();
  await consumeEvent(QUEUE_NAME, "order.created", handleOrderCreated);

  app.listen(PORT, () => {
    console.log(`[Inventory Service] Listening on port ${PORT}`);
    console.log(`[Inventory Service] Waiting for order.created events`);
  });
}

start();
