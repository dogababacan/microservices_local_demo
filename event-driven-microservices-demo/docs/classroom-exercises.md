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

In the web UI:

- **Expected Scenario Flow** is scripted. It explains what should happen for the selected scenario.
- **Live Broker Lab** is live. It polls RabbitMQ every second and shows actual queue state.

Live Broker Lab metrics:

- **Ready**: messages waiting in a queue.
- **Unacked**: messages delivered to a service but not confirmed yet.
- **Consumers**: running service instances currently reading from the queue.

Consumer rule:

- Multiple consumers on one queue compete for messages. Each message goes to one consumer.
- This is useful when the consumers are more instances of the same service.
- Different services should not share one queue if they each need every event. Give each service its own queue bound to the same exchange/routing key.

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

## Exercise 1: Notification Catch-Up Demo

Goal: show that an existing durable queue can hold a message while its service is stopped.

Important: this behavior is not visible in the scripted Expected Scenario Flow. Show it in the Live Broker Lab, RabbitMQ Management UI, and Docker logs.

1. Open RabbitMQ Management UI at `http://localhost:15672`.
2. Log in with `guest` / `guest`.
3. Go to **Queues and Streams**.
4. In the web UI, open **Live Broker Lab**.
5. In RabbitMQ UI, open `notification_service_events_queue`.
6. Stop Notification Service:

```powershell
docker compose stop notification-service
```

7. In the web UI, send a successful checkout:
   - `userId`: `student-1`
   - `productId`: `pencil`
   - `quantity`: `2`
8. In Live Broker Lab, watch the Notification Service queue card.
9. Expected result: `Consumers` becomes `0` and `Ready` becomes `1`.
10. In RabbitMQ, refresh `notification_service_events_queue`.
11. Expected result: `messages_ready` becomes `1`.
12. Start Notification Service again:

```powershell
docker compose start notification-service
```

13. Watch Notification Service logs:

```powershell
docker compose logs -f notification-service
```

Expected result:

```text
[Notification Service] [corr_...] Received event: payment.completed
[Notification Service] [corr_...] Notification: Order ord_... confirmed
```

14. In Live Broker Lab, watch the Notification Service queue card.
15. Expected result: `Consumers` returns to `1` and `Ready` returns to `0`.
16. Refresh the queue in RabbitMQ.
17. Expected result: `messages_ready` returns to `0`.

Teaching points:

- RabbitMQ kept the message in the service inbox.
- The publisher did not need to know Notification Service was stopped.
- This works because the queue already existed before the message was published.

## Exercise 2: Inventory Catch-Up Demo

Goal: show that a stopped downstream event consumer can pause the workflow without losing the event.

1. Open **Live Broker Lab** in the web UI.
2. Stop Inventory Service:

```powershell
docker compose stop inventory-service
```

3. Send a successful checkout from the web UI:
   - `userId`: `student-1`
   - `productId`: `pencil`
   - `quantity`: `1`
4. Watch `inventory_service_order_created_queue`.
5. Expected result: `Consumers` becomes `0` and `Ready` becomes `1`.
6. Check the order from the response panel. It exists, but it remains `created` because inventory has not processed `order.created` yet.
7. Start Inventory Service:

```powershell
docker compose start inventory-service
```

8. Watch the logs:

```powershell
docker compose logs -f inventory-service payment-service order-service notification-service
```

Expected result:

- Inventory consumes `order.created`.
- Inventory publishes `inventory.reserved`.
- Payment consumes `inventory.reserved`.
- Payment publishes `payment.completed`.
- Order Service consumes `payment.completed` and completes the order.
- Notification Service prints the confirmation.

Teaching points:

- The checkout request can be accepted even though Inventory Service is stopped.
- The workflow pauses at the event queue.
- When Inventory Service returns, it continues from the queued `order.created` event.

## Exercise 3: Order Service Unavailable

Goal: show that not every stopped service behaves like an async event consumer.

Order Service is different because API Gateway calls it synchronously before the event flow begins.

1. Open **Live Broker Lab** in the web UI.
2. Stop Order Service:

```powershell
docker compose stop order-service
```

3. Send a checkout from the web UI.
4. Expected result: API Gateway returns `502` with `Order Service is unavailable`.
5. Watch Live Broker Lab.
6. Expected result: RabbitMQ queues do not stack because no `order.created` event was published.
7. Start Order Service again:

```powershell
docker compose start order-service
```

8. Optional logs:

```powershell
docker compose logs -f api-gateway order-service
```

Teaching points:

- If the synchronous entry dependency is down, the request fails before the event-driven part begins.
- No queue can hold an event that was never published.
- This is why service position in the flow matters.

## Exercise 4: Modularity Demo

Goal: show that Analytics Service is a side observer and checkout does not depend on it.

1. Stop Analytics Service:

```powershell
docker compose stop analytics-service
```

2. Send a successful checkout from the web UI.
3. Open **Live Broker Lab** and watch `analytics_service_events_queue`.
4. Watch application logs:

```powershell
docker compose logs -f order-service inventory-service payment-service notification-service
```

Expected result:

- Order is created.
- Inventory is reserved.
- Payment completes.
- Notification is printed.
- Checkout still works without Analytics Service.

5. Start Analytics Service again:

```powershell
docker compose start analytics-service
```

6. Watch Analytics logs:

```powershell
docker compose logs -f analytics-service
```

Teaching points:

- Analytics consumes events from its own queue.
- Existing checkout services do not call Analytics directly.
- Adding or stopping Analytics should not break checkout.

## Exercise 5: Trace One Story

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

## Exercise 6: Predict Routing

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

## Exercise 7: Consistency Discussion

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
