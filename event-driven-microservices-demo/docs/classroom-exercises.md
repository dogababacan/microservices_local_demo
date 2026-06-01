# Classroom Exercises

These exercises are manual classroom demos. The web UI checklist only tracks progress; it does not stop containers, start containers, or read RabbitMQ live state.

Use these tools while teaching:

- Web UI: `http://localhost:3000`
- RabbitMQ Management UI: `http://localhost:15672`
- RabbitMQ username: `guest`
- RabbitMQ password: `guest`
- Application logs:

```powershell
docker compose logs -f api-gateway order-service inventory-service payment-service notification-service analytics-service
```

For a cleaner single-service view, replace the service list with one service name, for example:

```powershell
docker compose logs -f notification-service
```

## Before Class

Start the stack:

```powershell
docker compose up -d --build
```

Confirm every service is healthy:

```powershell
docker compose ps
```

Reset the in-memory classroom state:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/_teacher/reset" -Method Post
```

Optional automated check:

```powershell
.\scripts\smoke-test.ps1
```

## Exercise 1: Catch-Up Demo

Goal: show that an existing durable queue can hold a message while its service is stopped.

Important: this behavior is not visible in the scripted web timeline. Show it in RabbitMQ Management UI and Docker logs.

1. Open RabbitMQ Management UI at `http://localhost:15672`.
2. Log in with `guest` / `guest`.
3. Go to **Queues and Streams**.
4. Open `notification_service_events_queue`.
5. Stop Notification Service:

```powershell
docker compose stop notification-service
```

6. In the web UI, send a successful checkout:
   - `userId`: `student-1`
   - `productId`: `pencil`
   - `quantity`: `2`
7. In RabbitMQ, refresh `notification_service_events_queue`.
8. Expected result: `messages_ready` becomes `1`.
9. Start Notification Service again:

```powershell
docker compose start notification-service
```

10. Watch Notification Service logs:

```powershell
docker compose logs -f notification-service
```

Expected result:

```text
[Notification Service] [corr_...] Received event: payment.completed
[Notification Service] [corr_...] Notification: Order ord_... confirmed
```

11. Refresh the queue in RabbitMQ.
12. Expected result: `messages_ready` returns to `0`.

Teaching points:

- RabbitMQ kept the message in the service inbox.
- The publisher did not need to know Notification Service was stopped.
- This works because the queue already existed before the message was published.

## Exercise 2: Modularity Demo

Goal: show that Analytics Service is a side observer and checkout does not depend on it.

1. Stop Analytics Service:

```powershell
docker compose stop analytics-service
```

2. Send a successful checkout from the web UI.
3. Watch application logs:

```powershell
docker compose logs -f order-service inventory-service payment-service notification-service
```

Expected result:

- Order is created.
- Inventory is reserved.
- Payment completes.
- Notification is printed.
- Checkout still works without Analytics Service.

4. Start Analytics Service again:

```powershell
docker compose start analytics-service
```

5. Watch Analytics logs:

```powershell
docker compose logs -f analytics-service
```

Teaching points:

- Analytics consumes events from its own queue.
- Existing checkout services do not call Analytics directly.
- Adding or stopping Analytics should not break checkout.

## Exercise 3: Trace One Story

Goal: show how `correlationId` connects one checkout across multiple services.

1. Reset state:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/_teacher/reset" -Method Post
```

2. Send any checkout from the web UI.
3. Copy the `correlationId` from the API response panel.
4. Search logs for that ID:

```powershell
docker compose logs api-gateway order-service inventory-service payment-service notification-service analytics-service | Select-String "corr_..."
```

Replace `corr_...` with the real value.

Expected result:

- The same ID appears in API Gateway logs.
- The same ID appears in Order, Inventory, Payment, Notification, and Analytics logs depending on the scenario.

Teaching points:

- Event-driven systems are harder to follow without correlation IDs.
- A correlation ID is not business data; it is observability metadata.
- The API response may return before every background event is finished.

## Exercise 4: Predict Routing

Goal: make students reason from routing keys and queue bindings before looking at the answer.

Question:

```text
If Payment Service publishes payment.failed, which queues should receive a copy?
```

Expected answer:

- `notification_service_events_queue`
- `order_service_checkout_failed_queue`
- `analytics_service_events_queue`

How to verify:

1. Open RabbitMQ Management UI.
2. Go to **Exchanges**.
3. Open `ecommerce_events`.
4. Inspect bindings for routing key `payment.failed`.
5. Send payment failure from the web UI:
   - `userId`: `fail-payment`
   - `productId`: `pencil`
   - `quantity`: `1`
6. Watch logs:

```powershell
docker compose logs -f order-service notification-service analytics-service
```

Teaching points:

- One published event can be copied into multiple queues.
- Payment Service does not know who receives `payment.failed`.
- RabbitMQ routes by exchange bindings, not by direct service calls.

## Exercise 5: Consistency Discussion

Goal: show eventual consistency and compensation.

1. Reset state:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/_teacher/reset" -Method Post
```

2. Send payment failure from the web UI:
   - `userId`: `fail-payment`
   - `productId`: `pencil`
   - `quantity`: `1`
3. Watch logs:

```powershell
docker compose logs -f order-service inventory-service payment-service analytics-service
```

Expected event sequence:

```text
order.created
inventory.reserved
payment.failed
order.cancelled
inventory.release_requested
inventory.released
```

The exact log order can vary slightly because services consume events independently.

Teaching points:

- The order can become `cancelled` before stock release is logged.
- Inventory release is a compensation step.
- Payment Service does not edit stock directly; it publishes `inventory.release_requested`.
- Inventory Service owns stock and publishes `inventory.released`.

## Cleanup

Restart any stopped services:

```powershell
docker compose start notification-service analytics-service
```

Reset classroom state:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/_teacher/reset" -Method Post
```
