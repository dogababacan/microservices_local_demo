const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://localhost:3001";

app.use(express.json());

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "ok",
  });
});

app.post("/checkout", async (req, res) => {
  const { userId, productId, quantity } = req.body;

  if (!userId || !productId || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({
      message: "userId, productId, and a positive numeric quantity are required",
    });
  }

  const correlationId = createId("corr");

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
