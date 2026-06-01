const express = require("express");
const { connectWithRetry, publishEvent, consumeEvents } = require("./rabbitmq");

const app = express();
const PORT = process.env.PORT || 3001;

const CHECKOUT_FAILED_QUEUE = "order_service_checkout_failed_queue";
const CHECKOUT_FAILED_ROUTING_KEYS = ["inventory.failed", "payment.failed"];

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

app.get("/orders", (req, res) => {
  res.json({
    service: "order-service",
    orders,
  });
});

app.get("/orders/:orderId", (req, res) => {
  const { orderId } = req.params;
  const order = orders.find((entry) => entry.orderId === orderId);

  if (!order) {
    return res.status(404).json({
      message: "Order not found",
      orderId,
    });
  }

  res.json({
    service: "order-service",
    order,
  });
});

app.post("/reset", (req, res) => {
  orders.length = 0;
  console.log("[Order Service] Orders list cleared");
  res.json({
    service: "order-service",
    message: "Orders have been cleared",
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

async function handleCheckoutFailed(event) {
  const { eventType, correlationId, data } = event;
  const { orderId } = data;

  console.log(`[Order Service] [${correlationId}] Received event: ${eventType}`);

  const order = orders.find((entry) => entry.orderId === orderId);

  if (!order) {
    console.log(`[Order Service] [${correlationId}] No order found for ${orderId}`);
    return;
  }

  if (order.status === "cancelled") {
    console.log(`[Order Service] [${correlationId}] Order ${orderId} is already cancelled`);
    return;
  }

  order.status = "cancelled";

  console.log(`[Order Service] [${correlationId}] Cancelled order ${orderId} because of ${eventType}`);

  const cancelledEvent = createEvent("order.cancelled", correlationId, {
    orderId,
    reason: eventType,
    userId: order.userId,
    productId: order.productId,
    quantity: order.quantity,
  });

  await publishEvent("order.cancelled", cancelledEvent);

  console.log(`[Order Service] [${correlationId}] Published event: order.cancelled`);
}

async function start() {
  await connectWithRetry();
  await consumeEvents(CHECKOUT_FAILED_QUEUE, CHECKOUT_FAILED_ROUTING_KEYS, handleCheckoutFailed);

  app.listen(PORT, () => {
    console.log(`[Order Service] Listening on port ${PORT}`);
    console.log("[Order Service] Waiting for inventory.failed and payment.failed events");
  });
}

start();
