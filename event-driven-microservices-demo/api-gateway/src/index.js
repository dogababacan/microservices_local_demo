const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://localhost:3001";
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || "http://inventory-service:3002";

app.use(express.json());
app.use(express.static("src/public"));

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "ok",
  });
});

app.get("/_teacher/stock", async (req, res) => {
  try {
    const response = await fetch(`${INVENTORY_SERVICE_URL}/stock`);
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (error) {
    res.status(502).json({
      message: "Inventory Service is unavailable",
    });
  }
});

app.get("/_teacher/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/orders/${encodeURIComponent(orderId)}`);
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (error) {
    res.status(502).json({
      message: "Order Service is unavailable",
    });
  }
});

app.post("/_teacher/reset", async (req, res) => {
  try {
    const [invRes, ordRes] = await Promise.all([
      fetch(`${INVENTORY_SERVICE_URL}/reset`, { method: "POST" }),
      fetch(`${ORDER_SERVICE_URL}/reset`, { method: "POST" }),
    ]);

    if (invRes.ok && ordRes.ok) {
      res.json({
        message: "Classroom system state has been reset successfully",
      });
    } else {
      res.status(502).json({
        message: "Failed to reset some downstream services",
      });
    }
  } catch (error) {
    res.status(502).json({
      message: "Reset failed: one or more services are unavailable",
      error: error.message,
    });
  }
});

app.post("/checkout", async (req, res) => {
  const { userId, productId, quantity } = req.body;
  const correlationId = createId("corr");

  if (!userId || !productId || !Number.isFinite(quantity) || quantity <= 0) {
    const message = "userId, productId, and a positive numeric quantity are required";

    console.log(`[API Gateway] [${correlationId}] Rejected invalid checkout request: ${message}`);
    console.log(`[API Gateway] [${correlationId}] No order was created and no event was published`);

    return res.status(400).json({
      message,
      correlationId,
    });
  }

  console.log(`[API Gateway] [${correlationId}] Received POST /checkout`);

  try {
    // The API Gateway uses HTTP because outside clients need a direct
    // request/response entry point before the backend services use events.
    const response = await fetch(`${ORDER_SERVICE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        productId,
        quantity,
        correlationId,
      }),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(responseBody);
    }

    console.log(`[API Gateway] [${correlationId}] Order Service accepted checkout`);

    res.status(202).json({
      message: "Checkout request accepted",
      correlationId,
      order: responseBody.order,
    });
  } catch (error) {
    console.error(`[API Gateway] [${correlationId}] Could not reach Order Service`, error.message);

    res.status(502).json({
      message: "Order Service is unavailable",
    });
  }
});

app.listen(PORT, () => {
  console.log(`[API Gateway] Listening on port ${PORT}`);
});
