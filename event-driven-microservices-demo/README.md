# Event-Driven Microservices Demo

This project is a beginner-friendly local demo for teaching how microservices communicate using events.

It shows a small e-commerce checkout flow built with:

- Node.js
- Express.js
- RabbitMQ
- amqplib
- Docker
- Docker Compose

The project intentionally does not use databases. Each service uses in-memory data so students can focus on the communication pattern instead of persistence.

The important idea is not RabbitMQ itself; the important idea is that services communicate by announcing that something happened instead of directly telling another service what to do.

## Fast Summary

This demo shows a checkout system.

Only the first step uses HTTP:

```text
Client -> API Gateway -> Order Service
```

After the order is created, the rest of the system uses events:

```text
order.created -> inventory.reserved -> payment.completed -> notification
```

The main lesson: services do not directly call each other after order creation. They publish and consume events through RabbitMQ.

Analytics Service is added from the side. It listens to the same event notes without changing the existing checkout services.

## Quick Start

Start the project:

```bash
docker compose up --build
```

Then open the web UI:

```text
http://localhost:3000
```

Click one of the scenario buttons, send the checkout request, and watch the Docker Compose logs in the first terminal.

You can also send the same request from another terminal with curl:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"student-1","productId":"pencil","quantity":2}'
```

## Main Analogy: RabbitMQ As A Notice Board

RabbitMQ is like a notice board in a classroom.

A service publishes a note to the notice board.

Other services subscribe to notes they care about.

The publisher does not need to know who reads the note.

For example, the Order Service posts this note:

```text
order.created
```

The Inventory Service has subscribed to that kind of note, so it receives the note and reacts.

The Order Service does not call the Inventory Service directly. It only announces what happened.

## What This Project Demonstrates

A customer places an order for a product.

The API Gateway accepts the HTTP request, the Order Service creates an order, and the rest of the workflow happens through RabbitMQ events.

Important teaching goal:

- The Order Service does not know about the Inventory Service.
- The Inventory Service does not know about the Payment Service.
- The Payment Service does not know about the Notification Service.
- None of those services know Analytics Service exists.
- They communicate by publishing and consuming events.

The only direct HTTP call between services is:

```text
api-gateway -> order-service
```

Everything after order creation is event-driven.

Using the notice-board analogy:

- API Gateway asks Order Service to create an order.
- Order Service posts an `order.created` note.
- Inventory Service reads that note and posts a new note.
- Payment Service reads the inventory note and posts a payment note.
- Notification Service reads final outcome notes and prints messages.
- Analytics Service observes copies of those same notes and logs metrics.

## Architecture

```text
Client
  |
  | HTTP POST /checkout
  v
API Gateway
  |
  | HTTP POST /orders
  v
Order Service
  |
  | publishes order.created
  v
RabbitMQ exchange: ecommerce_events
  |
  | routes order.created
  +--> Inventory Service
  |     |
  |     | publishes inventory.reserved
  |     v
  |   RabbitMQ exchange: ecommerce_events
  |     |
  |     | routes inventory.reserved
  |     +--> Payment Service
  |     |     |
  |     |     | publishes payment.completed or payment.failed
  |     |     v
  |     |   RabbitMQ exchange: ecommerce_events
  |     |     |
  |     |     | routes payment.completed or payment.failed
  |     |     +--> Notification Service
  |     |     +--> Analytics Service observes payment.completed or payment.failed
  |     |
  |     +--> Analytics Service observes inventory.reserved
  |
  +--> Analytics Service observes order.created

Out-of-stock path:

Inventory Service
  |
  | publishes inventory.failed
  v
RabbitMQ exchange: ecommerce_events
  |
  | routes inventory.failed
  +--> Notification Service
  |
  +--> Analytics Service observes inventory.failed

Analytics Service uses its own queue:
analytics_service_events_queue
```

## Vocabulary Map

| Analogy | RabbitMQ term | In this project |
| --- | --- | --- |
| Notice board | RabbitMQ | The message broker running in Docker |
| Notice board area | Exchange | `ecommerce_events` |
| Label on a note | Routing key | `order.created`, `inventory.reserved`, and similar labels |
| Service inbox | Queue | `inventory_service_order_created_queue`, `payment_service_inventory_reserved_queue`, `notification_service_events_queue`, `analytics_service_events_queue` |
| Subscription rule | Binding | A rule that copies matching note labels into a service inbox |
| Service that posts a note | Producer | Order, Inventory, and Payment publish events |
| Service that reads notes | Consumer | Inventory, Payment, and Notification consume events |
| Note content | Message body | The JSON event envelope |

## A Short Warning About The Analogy

The notice-board analogy is simplified.

Real RabbitMQ has more precise behavior around exchanges, queues, bindings, acknowledgements, persistence, and delivery guarantees.

The analogy is still useful because it explains the most important beginner idea: services post event notes and other services read the notes they care about.

## What Are Microservices?

Microservices are small services that each own one part of a system.

In this demo:

- API Gateway receives client requests.
- Order Service creates orders.
- Inventory Service checks stock.
- Payment Service simulates payment.
- Notification Service prints messages for the customer.
- Analytics Service observes events and logs simple metrics.

An analogy: instead of one person doing every classroom job, different students have different responsibilities. One student records orders, another checks supplies, another handles payment, and another announces the result.

Each service can be started independently and has its own `package.json`.

## What Is Event-Driven Architecture?

Event-driven architecture means services communicate by publishing facts that happened.

For example:

```text
order.created
inventory.reserved
payment.completed
```

A service publishes an event, and other services can react to it.

Using the notice-board analogy, an event is a note that says:

```text
Something happened.
```

The publisher does not need to know which services will consume the event. This is what decouples the services.

## What Does RabbitMQ Do?

RabbitMQ is a message broker.

In this demo, RabbitMQ is the notice board.

It sits between services and moves messages from producers to consumers.

Without RabbitMQ, services often call each other directly. With RabbitMQ, services can publish event notes and let RabbitMQ deliver those notes to the right service inboxes.

RabbitMQ helps decouple services because producers and consumers do not need to know each other's network addresses.

## Exchange

An exchange receives messages from producers.

In the analogy, the exchange is the notice board area where notes are posted.

This demo uses a topic exchange named:

```text
ecommerce_events
```

The exchange looks at the routing key and decides which service inboxes should receive the message.

## Queue

A queue is a service inbox where matching notes wait until the service reads them.

One queue usually belongs to one service.

This demo uses stable queue names so they are easy to inspect in the RabbitMQ UI:

```text
inventory_service_order_created_queue
payment_service_inventory_reserved_queue
notification_service_events_queue
analytics_service_events_queue
```

The notification queue is a useful teaching example. It is one service inbox for one service, but it is subscribed to three routing keys.

The analytics queue is the modularity example. It is one service inbox for Analytics Service, and it subscribes to every existing checkout event.

## Routing Key

A routing key is the label on a note.

This demo uses these routing keys:

```text
order.created
inventory.reserved
inventory.failed
payment.completed
payment.failed
```

With a topic exchange, RabbitMQ uses the routing key to decide which service inbox should receive the note.

## Binding

A binding is a subscription rule.

It connects a service inbox to the note labels that service cares about.

For example:

```text
notification_service_events_queue subscribes to payment.completed
notification_service_events_queue subscribes to payment.failed
notification_service_events_queue subscribes to inventory.failed
analytics_service_events_queue subscribes to order.created
analytics_service_events_queue subscribes to inventory.reserved
analytics_service_events_queue subscribes to inventory.failed
analytics_service_events_queue subscribes to payment.completed
analytics_service_events_queue subscribes to payment.failed
```

That is why Notification Service can receive three different kinds of events using one service inbox.

That is also why Analytics Service can be added without changing the services that publish those events.

## Producer

A producer is a service that posts a note to the notice board.

Examples:

- Order Service produces `order.created`.
- Inventory Service produces `inventory.reserved` or `inventory.failed`.
- Payment Service produces `payment.completed` or `payment.failed`.

## Consumer

A consumer is a service that reads notes from its service inbox.

Examples:

- Inventory Service consumes `order.created`.
- Payment Service consumes `inventory.reserved`.
- Notification Service consumes `payment.completed`, `payment.failed`, and `inventory.failed`.
- Analytics Service consumes `order.created`, `inventory.reserved`, `inventory.failed`, `payment.completed`, and `payment.failed`.

## Event Envelope

Every event uses the same JSON structure:

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

In the notice-board analogy, this is the full note.

The metadata fields teach patterns used in real systems:

- `eventId`: unique ID for this note.
- `eventType`: what happened.
- `occurredAt`: when it happened.
- `correlationId`: shared ID used to follow one checkout across services.
- `data`: business data for the event.

## Notice-Board Version Of The Event Flow

1. The customer asks the API Gateway to check out.
2. API Gateway asks Order Service to create an order.
3. Order Service creates the order and posts an `order.created` note.
4. Inventory Service reads the `order.created` note from its service inbox.
5. Analytics Service also reads its own copy of the `order.created` note from its service inbox.
6. Inventory Service checks stock.
7. If stock exists, Inventory Service posts an `inventory.reserved` note.
8. If stock does not exist, Inventory Service posts an `inventory.failed` note.
9. Analytics Service observes the inventory result note from its own service inbox.
10. Payment Service reads the `inventory.reserved` note from its service inbox.
11. Payment Service simulates payment.
12. If payment succeeds, Payment Service posts a `payment.completed` note.
13. If payment fails, Payment Service posts a `payment.failed` note.
14. Notification Service reads final outcome notes from its service inbox.
15. Analytics Service observes the payment result note from its own service inbox.
16. Notification Service prints a human-readable message.

The key lesson: each service posts notes and reads notes. Services are not directly telling each other what to do. Analytics is a side observer, so checkout does not depend on it.

## Technical RabbitMQ Version Of The Event Flow

1. Client sends `POST /checkout` to API Gateway.
2. API Gateway forwards the request to Order Service over HTTP.
3. Order Service creates an order.
4. Order Service publishes `order.created` to the `ecommerce_events` topic exchange.
5. RabbitMQ routes the message to `inventory_service_order_created_queue`.
6. RabbitMQ also routes a copy of `order.created` to `analytics_service_events_queue`.
7. Inventory Service consumes `order.created`.
8. Analytics Service consumes its own copy of `order.created` and logs `checkout_started`.
9. If stock is available, Inventory Service publishes `inventory.reserved`.
10. If stock is not available, Inventory Service publishes `inventory.failed`.
11. RabbitMQ routes `inventory.reserved` to `payment_service_inventory_reserved_queue`.
12. RabbitMQ also routes inventory result events to `analytics_service_events_queue`.
13. Payment Service consumes `inventory.reserved`.
14. If payment succeeds, Payment Service publishes `payment.completed`.
15. If payment fails, Payment Service publishes `payment.failed`.
16. RabbitMQ routes `payment.completed`, `payment.failed`, and `inventory.failed` to `notification_service_events_queue`.
17. RabbitMQ also routes payment result events to `analytics_service_events_queue`.
18. Notification Service consumes the final event and logs a notification.
19. Analytics Service consumes its own event copies and logs metrics.

Advanced note: different queues bound to the same routing key each receive their own copy of the event. This is why Inventory and Analytics can both receive `order.created`.

## Why API Gateway Uses HTTP

The API Gateway is the entry point for clients.

Clients usually expect an immediate HTTP response. That is why `POST /checkout` is synchronous.

After the order is created, the rest of the workflow can continue asynchronously through events.

In the analogy, the customer talks directly to the front desk. After that, the classroom workers use the notice board.

## Why Order Service Publishes An Event

Order Service only owns order creation.

It publishes `order.created` to say:

```text
An order was created.
```

In the analogy, Order Service posts a note to the notice board. It does not walk around the room telling every other service what to do.

It does not directly call Inventory Service. This keeps Order Service independent.

## Why Inventory Does Not Directly Call Payment

Inventory Service only owns stock decisions.

When stock is available, it publishes `inventory.reserved`.

Payment Service listens for that event and decides what to do next. Inventory Service does not need to know Payment Service exists.

In the analogy, Inventory Service posts a new note. Payment Service subscribes to that note label.

## Why Payment Listens To inventory.reserved

Payment should only happen after inventory has been reserved.

That is why Payment Service listens to:

```text
inventory.reserved
```

In the analogy, Payment Service only reads notes labeled `inventory.reserved`.

## Why Notification Listens To Multiple Events

Notification Service needs to tell the customer about different outcomes.

It listens to:

- `payment.completed`
- `payment.failed`
- `inventory.failed`

This works because one service inbox can subscribe to multiple routing keys.

In the analogy, Notification Service has one service inbox, but three note labels are copied into it.

## Why Analytics Can Be Added From The Side

Analytics Service does not create orders, reserve inventory, charge payments, or notify customers.

It only watches event notes that already exist and logs simple metrics.

In the analogy, Analytics Service gets its own service inbox and subscribes to note labels that other services were already posting.

Order Service, Inventory Service, Payment Service, and Notification Service do not need to know Analytics Service exists.

This is the modularity lesson: a new service can subscribe to existing events without changing the publishers.

## Why Not Just Use Direct HTTP Calls?

Direct HTTP calls are useful in many situations.

HTTP is a good fit when:

- A client needs an immediate response.
- One service needs to ask another service a direct question.
- The workflow is simple and has only one receiver.
- You are building a simple read endpoint.

That is why this demo still uses HTTP from API Gateway to Order Service.

But direct HTTP calls can become painful when one action causes many reactions.

Imagine Order Service directly calling:

```text
Inventory Service
Payment Service
Notification Service
Analytics Service
Email Service
Shipping Service
```

Now Order Service must know all those service addresses. It must also decide what to do if one of them is slow or down.

With the notice-board style:

- Order Service posts `order.created`.
- Any interested service can subscribe.
- New services can be added later without changing Order Service.
- If a subscribed service is temporarily stopped, its existing service inbox can keep notes waiting.

Analytics Service demonstrates this. It subscribes to existing events without requiring changes in Order Service, Inventory Service, Payment Service, or Notification Service.

This is better than direct HTTP calls in situations where:

- One event should trigger multiple independent reactions.
- You want to add new consumers without changing the publisher.
- A service can process work later instead of immediately.
- You want services to know less about each other.

The tradeoff is that event-driven systems are harder to trace and are eventually consistent. The response may return before every background step is finished.

## Docker Compose depends_on

Docker Compose `depends_on` controls startup order only.

It can start the RabbitMQ container before the Node.js service containers, but it does not guarantee that RabbitMQ is ready to accept AMQP connections.

That is why the services still include RabbitMQ connection retry logic.

If RabbitMQ is still starting, services log a retry message and try again after a short delay.

In the analogy, Docker Compose can unlock the classroom door before students enter, but the notice board may still be getting set up.

## Durable Queues And Catching Up

This demo uses durable queues and persistent messages.

Durable queues survive RabbitMQ restarts.

Persistent messages are messages RabbitMQ should store more safely than normal transient messages.

Together, durable queues and persistent messages make the catch-up demo possible after the queue already exists.

That means RabbitMQ can keep messages in a service inbox while a service is temporarily stopped.

Important detail:

The service inbox must already exist before RabbitMQ can store messages for that service.

For the classroom catch-up demo:

1. Start all services once so RabbitMQ creates the service inboxes.
2. Stop `notification-service`.
3. Send a checkout request.
4. Restart `notification-service`.
5. Watch it consume the queued notification event.

If the notification service inbox was never created, RabbitMQ would have nowhere to store that notification message.

## In-Memory Inventory

Inventory is stored in a simple JavaScript object:

```js
{
  pencil: 10,
  notebook: 5,
  laptop: 0
}
```

Because this is in memory, stock resets when `inventory-service` restarts.

This is intentional for v1. It keeps the demo simple.

## Payment Failure And Compensating Actions

In this v1 demo, stock is deducted when inventory is reserved.

If payment later fails, the demo intentionally stops after publishing:

```text
payment.failed
```

A real production system would usually publish another event such as:

```text
inventory.release_requested
inventory.released
```

That would release the reserved stock.

This is a useful teaching moment for sagas and compensating actions, but it is skipped in v1 to keep the first lesson focused.

## Run The Project

From the project root:

```bash
docker compose up --build
```

The API Gateway will be available at:

```text
http://localhost:3000
```

RabbitMQ Management UI will be available at:

```text
http://localhost:15672
```

Login:

```text
Username: guest
Password: guest
```

## Using The Web UI

Open:

```text
http://localhost:3000
```

The web UI is only a friendly way to create the same `POST /checkout` request shown in the curl examples.

The browser sends HTTP to the API Gateway. The API Gateway forwards the request to Order Service. After the order is created, RabbitMQ events drive the rest of the workflow.

The Event Flow Timeline in the UI is a classroom visualization based on the selected scenario and API response. It is not live RabbitMQ tracing. Use Docker logs and RabbitMQ Management UI to observe the real backend behavior.

For prepared scenarios, the UI uses the real `correlationId` returned by API Gateway so students can search for the same ID in Docker Compose logs. For custom/manual input, the UI does not guess the async outcome; it tells students to check Docker logs and RabbitMQ UI.

Scenario buttons:

- Successful checkout: `student-1`, `pencil`, quantity `2`.
- Out of stock: `student-1`, `laptop`, quantity `1`.
- Payment failure: `fail-payment`, `pencil`, quantity `1`.
- Invalid request: `student-1`, `pencil`, quantity `0`.

After clicking a scenario, watch:

- The API response panel in the browser.
- Docker Compose logs in the terminal.
- RabbitMQ Management UI for exchanges, queues, bindings, and message counts.

## Health Checks

```bash
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
```

Example response:

```json
{
  "service": "inventory-service",
  "status": "ok"
}
```

## What To Look For In The RabbitMQ Management UI

Open:

```text
http://localhost:15672
```

Login with:

```text
Username: guest
Password: guest
```

Look for these parts:

- Exchanges page: `ecommerce_events` is the notice board area.
- Queues page: each queue is a service inbox.
- Queue names: they show which service owns each service inbox.
- Bindings: they show which note labels each service inbox subscribes to.
- Message counts: they show notes waiting to be read.
- Analytics queue: `analytics_service_events_queue` shows the new side observer service inbox.

During the catch-up demo, stop `notification-service`, send a checkout, and watch its queue hold a message until the service starts again.

## Read The Logs Like A Story

Every checkout gets a `correlationId`.

Example:

```text
[corr_123]
```

Read the logs by following that same ID across services:

```text
[Order Service] [corr_123] Published event: order.created
[Inventory Service] [corr_123] Received event: order.created
[Payment Service] [corr_123] Received event: inventory.reserved
[Notification Service] [corr_123] Notification: Order ord_123 confirmed
```

The `correlationId` is like writing the same classroom activity number on every related note.

## What To Watch In The Terminal

When you run Docker Compose, logs from all services appear together in one terminal.

That can look noisy at first.

Look for the same `correlationId` across multiple services.

That shared ID shows which logs belong to the same checkout request.

## Test Successful Checkout

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"student-1","productId":"pencil","quantity":2}'
```

Expected response:

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

The actual `orderId` and `correlationId` are generated dynamically, so they will be different each time.

Expected logs:

```text
[Order Service] [corr_123] Received checkout request
[Order Service] [corr_123] Created order ord_123
[Order Service] [corr_123] Published event: order.created

[Inventory Service] [corr_123] Received event: order.created
[Inventory Service] [corr_123] Stock available
[Inventory Service] [corr_123] Published event: inventory.reserved

[Payment Service] [corr_123] Received event: inventory.reserved
[Payment Service] [corr_123] Payment completed
[Payment Service] [corr_123] Published event: payment.completed

[Notification Service] [corr_123] Received event: payment.completed
[Notification Service] [corr_123] Notification: Order ord_123 confirmed

[Analytics Service] [corr_123] Received event: order.created
[Analytics Service] [corr_123] Metric: checkout_started
[Analytics Service] [corr_123] Received event: inventory.reserved
[Analytics Service] [corr_123] Metric: inventory_reserved
[Analytics Service] [corr_123] Received event: payment.completed
[Analytics Service] [corr_123] Metric: checkout_completed
```

Notice-board version:

```text
Order posts order.created.
Inventory reads order.created and posts inventory.reserved.
Payment reads inventory.reserved and posts payment.completed.
Notification reads payment.completed and prints the confirmation.
```

## Test Out-Of-Stock Checkout

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"student-1","productId":"laptop","quantity":1}'
```

Expected logs:

```text
[Order Service] [corr_123] Published event: order.created
[Inventory Service] [corr_123] Received event: order.created
[Inventory Service] [corr_123] Stock not available for order ord_123
[Inventory Service] [corr_123] Published event: inventory.failed
[Notification Service] [corr_123] Received event: inventory.failed
[Notification Service] [corr_123] Notification: Product is out of stock.
[Analytics Service] [corr_123] Received event: order.created
[Analytics Service] [corr_123] Metric: checkout_started
[Analytics Service] [corr_123] Received event: inventory.failed
[Analytics Service] [corr_123] Metric: checkout_failed_out_of_stock
```

Notice-board version:

```text
Order posts order.created.
Inventory reads order.created and posts inventory.failed.
Notification reads inventory.failed and prints the out-of-stock message.
```

## Test Payment Failure

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"fail-payment","productId":"pencil","quantity":1}'
```

Expected logs:

```text
[Order Service] [corr_123] Published event: order.created
[Inventory Service] [corr_123] Published event: inventory.reserved
[Payment Service] [corr_123] Received event: inventory.reserved
[Payment Service] [corr_123] Payment failed
[Payment Service] [corr_123] Published event: payment.failed
[Notification Service] [corr_123] Received event: payment.failed
[Notification Service] [corr_123] Notification: Payment failed. Please try again.
[Analytics Service] [corr_123] Received event: order.created
[Analytics Service] [corr_123] Metric: checkout_started
[Analytics Service] [corr_123] Received event: inventory.reserved
[Analytics Service] [corr_123] Metric: inventory_reserved
[Analytics Service] [corr_123] Received event: payment.failed
[Analytics Service] [corr_123] Metric: checkout_failed_payment
```

Notice-board version:

```text
Order posts order.created.
Inventory reads order.created and posts inventory.reserved.
Payment reads inventory.reserved and posts payment.failed.
Notification reads payment.failed and prints the payment failure message.
```

## Test Invalid Checkout Request

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"student-1","productId":"pencil","quantity":0}'
```

Expected behavior:

- API Gateway returns `400`.
- The response includes a `correlationId` that can be searched in the logs.
- No order is created.
- No `order.created` event is published.

Teaching point:

```text
Invalid request -> rejected at the system boundary -> no event.
Valid request -> accepted command -> event can be published.
```

## Modularity Demo: Analytics Service

Analytics Service shows that event-driven systems can grow without changing the existing publishers.

It was added from the side. The checkout flow already worked before Analytics Service existed.

What it does:

- Owns the queue `analytics_service_events_queue`.
- Consumes `order.created`, `inventory.reserved`, `inventory.failed`, `payment.completed`, and `payment.failed`.
- Publishes no events.
- Logs simple metrics for classroom discussion.

Metrics it logs:

```text
order.created -> checkout_started
inventory.reserved -> inventory_reserved
inventory.failed -> checkout_failed_out_of_stock
payment.completed -> checkout_completed
payment.failed -> checkout_failed_payment
```

Why existing services do not change:

- Order Service already publishes `order.created`.
- Inventory Service already publishes `inventory.reserved` and `inventory.failed`.
- Payment Service already publishes `payment.completed` and `payment.failed`.
- Analytics Service only subscribes to those existing note labels.

In the notice-board analogy, Analytics Service gets its own service inbox and reads copies of notes that were already being posted.

Advanced note:

Different queues bound to the same routing key each receive their own copy of the event. This is why Inventory and Analytics can both receive `order.created`.

To show that checkout does not depend on Analytics Service:

```bash
docker compose stop analytics-service
```

Send a checkout request. Order, Inventory, Payment, and Notification still work.

Restart Analytics Service:

```bash
docker compose start analytics-service
```

Expected Analytics logs for a successful checkout:

```text
[Analytics Service] [corr_123] Received event: order.created
[Analytics Service] [corr_123] Metric: checkout_started
[Analytics Service] [corr_123] Received event: inventory.reserved
[Analytics Service] [corr_123] Metric: inventory_reserved
[Analytics Service] [corr_123] Received event: payment.completed
[Analytics Service] [corr_123] Metric: checkout_completed
```

Expected Analytics logs for an out-of-stock checkout:

```text
[Analytics Service] [corr_123] Received event: order.created
[Analytics Service] [corr_123] Metric: checkout_started
[Analytics Service] [corr_123] Received event: inventory.failed
[Analytics Service] [corr_123] Metric: checkout_failed_out_of_stock
```

Expected Analytics logs for a payment failure:

```text
[Analytics Service] [corr_123] Received event: order.created
[Analytics Service] [corr_123] Metric: checkout_started
[Analytics Service] [corr_123] Received event: inventory.reserved
[Analytics Service] [corr_123] Metric: inventory_reserved
[Analytics Service] [corr_123] Received event: payment.failed
[Analytics Service] [corr_123] Metric: checkout_failed_payment
```

## Classroom Demo Plan

1. Start RabbitMQ and all services:
   ```bash
   docker compose up --build
   ```
2. Open RabbitMQ UI at `http://localhost:15672`.
3. Show the exchange named `ecommerce_events`.
4. Explain that the exchange is the notice board area where notes are posted.
5. Show the durable queues.
6. Explain that each queue is a service inbox.
7. Open the web UI at `http://localhost:3000`.
8. Send a successful checkout request with the UI.
9. Show the equivalent curl command so students see the raw HTTP request.
10. Watch logs in each service.
11. Send an out-of-stock checkout request.
12. Watch how `inventory.failed` is handled.
13. Send a payment failure request.
14. Show Analytics Service logs and explain that it was added without changing existing services.
15. Stop `analytics-service` and send another checkout to show the main flow still works.
16. Restart `analytics-service`.
17. Stop `notification-service`.
18. Send another successful checkout.
19. Restart `notification-service`.
20. Explain how durable service inboxes allow services to catch up after the service inbox has already been created.

To stop only the notification service:

```bash
docker compose stop notification-service
```

To restart it:

```bash
docker compose start notification-service
```

To stop only the analytics service:

```bash
docker compose stop analytics-service
```

To restart it:

```bash
docker compose start analytics-service
```

## Suggested Teaching Script

1. "The client only knows about the API Gateway."
2. "The Order Service creates an order and posts an event note."
3. "The Order Service does not know who reads that note."
4. "RabbitMQ routes the note using the routing key label."
5. "Inventory reacts to `order.created`."
6. "Payment reacts to `inventory.reserved`."
7. "Notification reacts to several outcomes."
8. "Analytics reacts from the side using its own service inbox."
9. "Each service owns its own behavior."
10. "The correlation ID lets us follow one checkout across service logs."
11. "This is eventually consistent because the API response returns before the whole workflow finishes."

## What Students Should Notice

- Order Service does not import or call Inventory Service.
- Inventory Service does not import or call Payment Service.
- Payment Service does not import or call Notification Service.
- Each service only knows RabbitMQ and event names.
- A publisher posts a note and continues.
- Consumers read matching notes from their own service inboxes.
- Notification Service can receive three event types without any producer knowing about Notification Service.
- Analytics Service can receive all checkout event types without any producer knowing about Analytics Service.
- Inventory and Analytics can both receive `order.created` because they use different queues bound to the same routing key.
- Adding a new service that listens to `order.created` would not require changing Order Service.

## Classroom Questions

Ask these while watching the logs:

- Who posted this note?
- What was the label on the note?
- Which service inbox received it?
- Which service read it?
- Did the publisher know who would read the note?
- Could another service subscribe to `order.created` without changing Order Service?
- Why can Inventory and Analytics both receive `order.created`?
- Does checkout still work if Analytics Service is stopped?
- What happens if Notification Service is stopped after its service inbox exists?
- Why does the API response return before payment and notification finish?
- What compensating event might we add after `payment.failed` in a real system?

## Common Questions Students May Ask

### Why not just call every service with HTTP?

HTTP is simple, but it couples services together. If Order Service directly calls Inventory, Payment, and Notification, it needs to know all of them.

With events, Order Service only announces what happened.

In the analogy, Order Service posts a note instead of walking to every service inbox itself.

### Does the client know whether payment succeeded?

Not immediately in this simple demo.

The API returns after the order is created. Payment happens afterward through events.

This is part of eventual consistency.

### What happens if a service is down?

If the service inbox already exists, RabbitMQ can store messages until the service comes back.

If Analytics Service is down, checkout still works because Analytics is only a side observer.

### What happens if RabbitMQ is down?

The services in this demo retry their RabbitMQ connection at startup. In production, you would also need stronger error handling, monitoring, and recovery plans.

### Why does inventory reset after restart?

Because this demo uses in-memory data instead of a database.

### What happens to inventory if payment fails?

In this v1 demo, nothing else happens.

In production, payment failure would trigger a compensating event to release inventory.

## Synchronous HTTP vs Event-Driven Messaging

With synchronous HTTP:

- The caller waits for the receiver.
- The caller needs the receiver's address.
- A slow receiver can slow down the caller.
- A failed receiver can break the request flow.

With event-driven messaging:

- The publisher sends an event and continues.
- RabbitMQ stores and routes the message.
- Consumers process messages independently.
- Services are less directly connected.

In the analogy, HTTP is like walking to a specific person and waiting for an answer. Event-driven messaging is like posting a labeled note to the notice board and letting subscribers read it.

## Eventual Consistency

Eventual consistency means the whole system does not update at exactly the same time.

In this demo, the API Gateway returns after the order is created.

Inventory, payment, and notification happen shortly after through events.

For a short time, the order may be created while payment is still pending.

In the analogy, the first note has been posted, but not every service has read and reacted to its notes yet.

## What To Improve In A Real Production System

This demo is intentionally simple. A real system would add:

- Databases for durable service state.
- Idempotency so duplicate messages do not cause duplicate work.
- Dead-letter queues for messages that repeatedly fail.
- Retries with backoff.
- Message schema validation.
- Authentication and authorization.
- Observability with logs, metrics, and traces.
- A real payment provider.
- Inventory release events when payment fails.
- Automated tests.
- Graceful shutdown handling.

## Visual Event Timeline

This project now includes an educational Visual Event Timeline in the web UI at `http://localhost:3000`.

Why the timeline exists:
- It provides a classroom visualization of the event flow based on the selected scenario and API response.
- It is designed to be easier to read than mixed container logs, making it ideal for classroom instruction.
- It maps the HTTP request and subsequent event-driven steps clearly to the notice-board analogy.

How to use it during class:
- Toggle between "Beginner View" and "Technical View" to explain concepts gradually.
- Watch as the timeline visually reveals each step (API Gateway -> Order -> Inventory -> Payment -> Notification).
- Notice that Analytics Service appears as a parallel observer. It does not block or control checkout.
- For prepared scenarios, note that the UI uses the real `correlationId` returned by API Gateway. Search that ID in Docker Compose logs to find the real backend output.
- For custom/manual input, the UI does not guess the async outcome. Check Docker logs and RabbitMQ Management UI for what actually happened.

Important Note:
The timeline is a teaching visualization. It is not live RabbitMQ tracing. The real service logs in Docker Compose and RabbitMQ Management UI are still the source for observing real backend behavior.

## Service Explorer

The web UI at `http://localhost:3000` includes expandable service explanations.

Students can use the Service Explorer to understand:
- What each service owns and its main responsibilities.
- Which events each service publishes and consumes.
- What each service does NOT know about the rest of the system.
- How Analytics Service observes existing events without becoming part of the main checkout chain.
- How the codebase maps to these responsibilities.

This section supports the classroom explanation either before running scenarios (to establish concepts) or after (to review).

## Cleaner Application Logs

If you find the default Docker Compose logs too noisy because of RabbitMQ's internal logs, you can filter them to show only application services.

Run this command:

```bash
docker compose logs -f api-gateway order-service inventory-service payment-service notification-service analytics-service
```

This hides RabbitMQ internal logs and makes the event flow much easier to read in the terminal.
