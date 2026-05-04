const express = require("express");
const { connectWithRetry, publishEvent } = require("./rabbitmq");

const app = express();
const PORT = process.env.PORT || 3001;

const orders = [];

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
    service: "order-service",
    status: "ok",
  });
});

app.post("/orders", async (req, res) => {
  const { userId, productId, quantity, correlationId = createId("corr") } = req.body;

  if (!userId || !productId || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({
      message: "userId, productId, and a positive numeric quantity are required",
    });
  }

  console.log(`[Order Service] [${correlationId}] Received checkout request`);

  const order = {
    orderId: createId("ord"),
    userId,
    productId,
    quantity,
    status: "created",
  };

  orders.push(order);

  console.log(`[Order Service] [${correlationId}] Created order ${order.orderId}`);

  const event = createEvent("order.created", correlationId, order);

  try {
    // Order Service posts an order.created note without knowing who will read it.
    await publishEvent("order.created", event);

    console.log(`[Order Service] [${correlationId}] Published event: order.created`);

    res.status(201).json({ order });
  } catch (error) {
    console.error(`[Order Service] [${correlationId}] Failed to publish order.created`, error.message);

    res.status(500).json({
      message: "Order was created, but the event could not be published",
    });
  }
});

async function start() {
  await connectWithRetry();

  app.listen(PORT, () => {
    console.log(`[Order Service] Listening on port ${PORT}`);
  });
}

start();
