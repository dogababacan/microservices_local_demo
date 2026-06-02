# Event-Driven Microservices Demo

This repository is a local classroom demo for teaching how microservices behave when they communicate through events.

It models a small e-commerce checkout system. A client submits a checkout request, an order is created, inventory is checked, payment is simulated, notifications are printed, and analytics observes the flow from the side.

The project intentionally uses in-memory state instead of databases. That keeps the focus on service boundaries, message routing, asynchronous behavior, failure positions, and eventual consistency.

## What Students Should Learn

- A microservice owns one responsibility and its own state.
- The first client request uses HTTP because clients need a request/response entry point.
- After the order is created, services communicate through RabbitMQ events.
- Producers publish facts such as `order.created`; they do not directly call every interested service.
- Consumers receive matching events through their own queues.
- Different services that need the same event must use different queues.
- A stopped downstream event consumer can catch up later if its durable queue already exists.
- A stopped synchronous dependency fails the request before an event exists.
- Event-driven workflows are eventually consistent: the API response can return before background work completes.
- Compensation is a normal pattern when a later step fails after an earlier step has reserved resources.

## Technology Stack

- Node.js
- Express.js
- RabbitMQ
- `amqplib`
- Docker
- Docker Compose

## Repository Layout

```text
event-driven-microservices-demo/
  docker-compose.yml
  README.md
  docs/
    classroom-exercises.md
  scripts/
    smoke-test.ps1
  api-gateway/
    src/index.js
    src/public/index.html
  order-service/
    src/index.js
    src/rabbitmq.js
  inventory-service/
    src/index.js
    src/rabbitmq.js
  payment-service/
    src/index.js
    src/rabbitmq.js
  notification-service/
    src/index.js
    src/rabbitmq.js
  analytics-service/
    src/index.js
    src/rabbitmq.js
```

Each service has its own `package.json`, `Dockerfile`, HTTP health endpoint, and isolated process.

## Quick Start

From `event-driven-microservices-demo`:

```bash
docker compose up --build
```

Open the browser UI:

```text
http://localhost:3000
```

Open RabbitMQ Management UI:

```text
http://localhost:15672
```

RabbitMQ login:

```text
Username: guest
Password: guest
```

Follow logs while teaching:

```bash
docker compose logs -f api-gateway order-service inventory-service payment-service notification-service analytics-service
```

Run the smoke test on Windows PowerShell:

```powershell
.\scripts\smoke-test.ps1
```

The smoke test checks service health, resets in-memory state, and verifies the successful, out-of-stock, payment-failure, and invalid-checkout paths.

## System Overview

The checkout starts synchronously:

```text
Client -> API Gateway -> Order Service
```

Everything after order creation is event-driven:

```text
Order Service -> RabbitMQ -> Inventory Service
Inventory Service -> RabbitMQ -> Payment Service
Payment Service -> RabbitMQ -> Order Service / Notification Service / Inventory Service
All published events -> RabbitMQ -> Analytics Service
```

The only direct HTTP call between backend services in the checkout path is:

```text
api-gateway -> order-service
```

Order Service does not call Inventory Service over HTTP. Inventory Service does not call Payment Service over HTTP. Payment Service does not call Notification Service or Inventory Service over HTTP.

## Main Analogy: RabbitMQ As A Notice Board

RabbitMQ is like a classroom notice board.

- A service posts one labeled note to a shared board area, called an exchange.
- The note has a label, such as `order.created`.
- RabbitMQ copies the note into separate service inboxes, called queues, whose subscription rules match that label.
- The publisher does not need to know who reads the note.

Example:

```text
Order Service publishes one event: order.created
RabbitMQ routes copies to matching queues:
- inventory_service_order_created_queue
- analytics_service_events_queue
```

Inventory and Analytics both receive the event because they have different queues bound to the same exchange.

## Microservices In This Demo

| Service | Port | Responsibility | State |
| --- | ---: | --- | --- |
| API Gateway | 3000 | Public HTTP entry point and teaching UI | None |
| Order Service | 3001 | Creates, completes, and cancels orders | In-memory `orders` array |
| Inventory Service | 3002 | Reserves and releases stock | In-memory `stock` object |
| Payment Service | 3003 | Simulates payment success/failure | None |
| Notification Service | 3004 | Logs customer-facing notifications | None |
| Analytics Service | 3005 | Observes all events and logs metrics | None |
| RabbitMQ | 5672 / 15672 | Message broker and management UI | Broker queues/messages |

Default inventory:

```js
{
  pencil: 10,
  notebook: 5,
  laptop: 0
}
```

Because this state is in memory, orders and stock reset when the corresponding service restarts. The `_teacher/reset` endpoint also resets orders and stock for classroom use.

## RabbitMQ Concepts Used

| Concept | Classroom analogy | In this project |
| --- | --- | --- |
| Broker | Notice board system | RabbitMQ container |
| Exchange | Notice board area | `ecommerce_events` |
| Routing key | Label on a note | `order.created`, `payment.failed`, etc. |
| Queue | Service inbox | One queue per consumer role |
| Binding | Subscription rule | Queue subscribed to a routing key |
| Producer | Service posting a note | Order, Inventory, Payment |
| Consumer | Service reading a note | Order, Inventory, Payment, Notification, Analytics |
| Message body | Full note content | JSON event envelope |

This demo uses a durable RabbitMQ topic exchange:

```text
ecommerce_events
```

Topic exchanges route messages by routing key. The analytics queue uses the wildcard binding `#`, which means "all routing keys".

## Queues And Bindings

| Queue | Owner | Binding keys |
| --- | --- | --- |
| `inventory_service_order_created_queue` | Inventory Service | `order.created` |
| `inventory_service_release_requested_queue` | Inventory Service | `inventory.release_requested` |
| `payment_service_inventory_reserved_queue` | Payment Service | `inventory.reserved` |
| `order_service_payment_completed_queue` | Order Service | `payment.completed` |
| `order_service_checkout_failed_queue` | Order Service | `inventory.failed`, `payment.failed` |
| `notification_service_events_queue` | Notification Service | `payment.completed`, `payment.failed`, `inventory.failed` |
| `analytics_service_events_queue` | Analytics Service | `#` |

Important rule for students:

- Multiple consumers on the same queue compete for messages. Each message goes to one consumer.
- Different services should not share one queue if every service needs every event.
- If two services both need `order.created`, give each service its own queue bound to `order.created`.

## Event Envelope

Every event uses the same structure:

```json
{
  "eventId": "evt_123",
  "eventType": "order.created",
  "occurredAt": "2026-05-04T12:00:00.000Z",
  "correlationId": "corr_123",
  "data": {
    "orderId": "ord_123",
    "userId": "student-1",
    "productId": "pencil",
    "quantity": 2
  }
}
```

Fields:

- `eventId`: unique ID for this event message.
- `eventType`: what happened.
- `occurredAt`: when the event was created.
- `correlationId`: shared ID for tracing one checkout through all services.
- `data`: business payload.

## Published Events

| Event | Producer | Meaning |
| --- | --- | --- |
| `order.created` | Order Service | A checkout request created an order |
| `order.completed` | Order Service | Payment succeeded and the order is complete |
| `order.cancelled` | Order Service | Inventory or payment failure cancelled the order |
| `inventory.reserved` | Inventory Service | Stock was reserved for an order |
| `inventory.failed` | Inventory Service | Stock was not available |
| `inventory.release_requested` | Payment Service | Payment failed after stock reservation, so stock should be restored |
| `inventory.released` | Inventory Service | Reserved stock was restored |
| `payment.completed` | Payment Service | Payment succeeded |
| `payment.failed` | Payment Service | Payment failed |

## Scenario 1: Successful Checkout

Trigger:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"student-1","productId":"pencil","quantity":2}'
```

Flow:

```text
Client
  -> API Gateway: POST /checkout
  -> Order Service: POST /orders
  -> order.created
  -> Inventory Service reserves stock
  -> inventory.reserved
  -> Payment Service completes payment
  -> payment.completed
  -> Order Service completes order
  -> order.completed
  -> Notification Service prints confirmation
  -> Analytics Service observes all events
```

Expected final state:

- Order status eventually becomes `completed`.
- Pencil stock decreases from `10` to `8`.
- Notification logs "Order ... confirmed".
- Analytics logs metrics for checkout start, inventory reservation, payment completion, and order completion.

The HTTP response returns quickly and may show the order as `created`, because completion happens asynchronously after the response.

## Scenario 2: Out Of Stock

Trigger:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"student-1","productId":"laptop","quantity":1}'
```

Flow:

```text
Client
  -> API Gateway
  -> Order Service creates order
  -> order.created
  -> Inventory Service checks laptop stock
  -> inventory.failed
  -> Notification Service prints out-of-stock message
  -> Order Service cancels order
  -> order.cancelled
  -> Analytics Service observes the failure and cancellation
```

Expected final state:

- Order status eventually becomes `cancelled`.
- Laptop stock remains `0`.
- No payment is attempted because inventory was not reserved.

## Scenario 3: Payment Failure With Compensation

Trigger:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"fail-payment","productId":"pencil","quantity":1}'
```

The `userId` value `fail-payment` is a built-in teaching trigger. Payment Service treats it as a simulated failure.

Flow:

```text
Client
  -> API Gateway
  -> Order Service creates order
  -> order.created
  -> Inventory Service reserves stock
  -> inventory.reserved
  -> Payment Service simulates failure
  -> payment.failed
  -> Notification Service prints payment failure message
  -> Order Service cancels order
  -> order.cancelled
  -> Payment Service requests inventory compensation
  -> inventory.release_requested
  -> Inventory Service restores stock
  -> inventory.released
  -> Analytics Service observes all events
```

Expected final state:

- Order status eventually becomes `cancelled`.
- Pencil stock is restored after compensation.
- Notification does not send a second customer message for `inventory.released`.

Teaching point: Payment Service does not edit stock directly. Inventory Service owns stock, so Payment Service publishes `inventory.release_requested`, and Inventory Service performs the release.

## Scenario 4: Invalid Checkout

Trigger:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"student-1","productId":"pencil","quantity":0}'
```

Expected behavior:

- API Gateway returns `400`.
- The response includes a `correlationId`.
- No order is created.
- No event is published.

Teaching point:

```text
Invalid command -> rejected at the boundary -> no event exists.
```

## HTTP API

### API Gateway

```text
GET  /health
POST /checkout
GET  /_teacher/stock
GET  /_teacher/orders/:orderId
GET  /_teacher/rabbitmq/queues
POST /_teacher/reset
```

`POST /checkout` body:

```json
{
  "userId": "student-1",
  "productId": "pencil",
  "quantity": 2
}
```

Successful response:

```json
{
  "message": "Checkout request accepted",
  "correlationId": "corr_123",
  "order": {
    "orderId": "ord_123",
    "userId": "student-1",
    "productId": "pencil",
    "quantity": 2,
    "status": "created"
  }
}
```

### Order Service

```text
GET  /health
GET  /orders
GET  /orders/:orderId
POST /orders
POST /reset
```

### Inventory Service

```text
GET  /health
GET  /stock
GET  /stock/:productId
POST /reset
```

### Payment, Notification, Analytics

```text
GET /health
```

They mainly communicate through RabbitMQ events.

## Using The Web UI

Open:

```text
http://localhost:3000
```

The UI sends the same `POST /checkout` request shown in the curl examples.

Scenario buttons:

- Successful checkout: `student-1`, `pencil`, quantity `2`.
- Out of stock: `student-1`, `laptop`, quantity `1`.
- Payment failure: `fail-payment`, `pencil`, quantity `1`.
- Invalid request: `student-1`, `pencil`, quantity `0`.

Useful UI areas:

- API response panel: shows the immediate HTTP response and `correlationId`.
- Expected Scenario Flow: scripted teaching view for the selected scenario.
- Live Broker Lab: polls RabbitMQ queue state every second.
- Scenario State: reads current in-memory order and stock state through the gateway.
- Analytics panel: visualizes expected analytics events for teaching.

The Expected Scenario Flow is a teaching visualization. Docker logs and RabbitMQ queue state are the source of truth for what actually happened.

## Reading Logs With Correlation IDs

Every checkout has one `correlationId`, for example:

```text
corr_1710000000000_abcd
```

Search the logs for that ID:

```bash
docker compose logs api-gateway order-service inventory-service payment-service notification-service analytics-service | grep corr_1710000000000_abcd
```

On PowerShell:

```powershell
docker compose logs api-gateway order-service inventory-service payment-service notification-service analytics-service | Select-String "corr_1710000000000_abcd"
```

Example successful story:

```text
[API Gateway] [corr_123] Received POST /checkout
[Order Service] [corr_123] Published event: order.created
[Inventory Service] [corr_123] Received event: order.created
[Inventory Service] [corr_123] Published event: inventory.reserved
[Payment Service] [corr_123] Published event: payment.completed
[Order Service] [corr_123] Published event: order.completed
[Notification Service] [corr_123] Notification: Order ord_123 confirmed
[Analytics Service] [corr_123] Metric: order_completed
```

## Broker Reliability Behavior In This Demo

The services use:

- Durable topic exchange: `ecommerce_events`.
- Durable queues: `assertQueue(queueName, { durable: true })`.
- Persistent published messages: `persistent: true`.
- Confirm channels for publishing in Order, Inventory, and Payment services.
- `prefetch(1)` so each consumer handles one message at a time.
- Explicit `ack` after successful handling.
- `nack(..., requeue=true)` when handler logic fails.
- `nack(..., requeue=false)` for invalid JSON.
- Retry loops while RabbitMQ is still starting.

This is still a teaching demo, not production-grade messaging. It does not include databases, idempotency tables, dead-letter queues, distributed tracing infrastructure, schema registry, auth, TLS, or exactly-once guarantees.

## Durable Queues And Catch-Up

Durable queues and persistent messages let a stopped consumer catch up after it returns, but only if the queue already exists.

Classroom sequence:

1. Start all services once so each service creates its queue and binding.
2. Stop `notification-service`.
3. Send a successful checkout.
4. Watch `notification_service_events_queue` show `messages_ready = 1`.
5. Start `notification-service`.
6. Watch it consume the waiting message.

Commands:

```bash
docker compose stop notification-service
docker compose start notification-service
```

Important distinction:

- If Notification Service is stopped, RabbitMQ can hold messages in its existing queue.
- If Order Service is stopped, API Gateway cannot create the order, so no `order.created` event is published and RabbitMQ has nothing to hold.

## Eventual Consistency

The API Gateway returns `202 Accepted` after Order Service creates the order.

At that moment, the order may still be:

```text
created
```

Later, event consumers may update it to:

```text
completed
```

or:

```text
cancelled
```

This is eventual consistency. The system accepts the command first, then the asynchronous workflow reaches a final outcome.

Use:

```text
GET /_teacher/orders/:orderId
```

to show the final order status after the async events finish.

## Why Analytics Can Be Added Without Changing Checkout

Analytics Service owns its own queue:

```text
analytics_service_events_queue
```

It binds that queue with:

```text
#
```

That means it receives all events published to `ecommerce_events`.

Order, Inventory, Payment, and Notification do not import Analytics code, call Analytics over HTTP, or know Analytics exists.

To demonstrate modularity:

```bash
docker compose stop analytics-service
```

Send a checkout. The main checkout still completes because Analytics is only a side observer.

Then restart:

```bash
docker compose start analytics-service
```

Analytics catches up from its own queue if the queue existed before it was stopped.

## What To Show In RabbitMQ Management UI

Open:

```text
http://localhost:15672
```

Look at:

- Exchanges: `ecommerce_events`.
- Queues: each named service inbox.
- Bindings: routing keys connected to each queue.
- Ready messages: messages waiting in a queue.
- Unacked messages: messages delivered but not yet acknowledged.
- Consumers: running service instances currently reading a queue.

Useful live demo:

1. Start all services.
2. Open `notification_service_events_queue`.
3. Stop `notification-service`.
4. Send a successful checkout.
5. Refresh RabbitMQ UI and show one ready message.
6. Start `notification-service`.
7. Refresh again and show the message count return to zero.

## Classroom Demo Plan

1. Explain the notice-board analogy.
2. Start the stack with `docker compose up --build`.
3. Open the web UI and RabbitMQ Management UI.
4. Show the `ecommerce_events` exchange.
5. Show each queue and binding.
6. Send a successful checkout from the UI.
7. Follow the same `correlationId` in logs.
8. Show that the HTTP response arrives before the final async order state.
9. Send the out-of-stock scenario and discuss failure before payment.
10. Send the payment-failure scenario and discuss compensation.
11. Stop Notification Service and show catch-up behavior.
12. Stop Order Service and show synchronous failure before an event exists.
13. Stop Analytics Service and show the main checkout still works.
14. Ask students which services know about each other directly.

Detailed exercises are in:

```text
docs/classroom-exercises.md
```

## Discussion Questions

- Which part of the flow is synchronous?
- Which part of the flow is asynchronous?
- Which service owns order state?
- Which service owns stock state?
- Why should Payment Service not directly modify inventory stock?
- Why can Inventory and Analytics both receive `order.created`?
- What happens if two different services share one queue?
- Why can Notification Service catch up after restart?
- Why can RabbitMQ not help when Order Service is down before order creation?
- Why does the API response sometimes show `created` even though the final status becomes `completed` or `cancelled`?
- What production features are missing from this teaching demo?

## Production Gaps To Mention

This project is intentionally small. Real systems usually also need:

- Persistent databases per service.
- Idempotent consumers.
- Deduplication based on event IDs.
- Dead-letter queues.
- Retry limits and backoff.
- Observability with traces, metrics, and structured logs.
- Event schema versioning.
- Authentication and authorization.
- Secrets management.
- TLS for service and broker communication.
- Operational dashboards and alerts.
- Careful handling of distributed transactions and compensation.

Those topics are easier to teach after students understand this smaller event-driven flow.

## Stop The Project

```bash
docker compose down
```

Remove containers and volumes if you want a fully clean RabbitMQ state:

```bash
docker compose down -v
```
