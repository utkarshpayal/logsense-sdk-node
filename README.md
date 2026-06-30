# LogSense Node.js SDK

The official Node.js SDK for the **LogSense** observability platform. Designed for high performance, low overhead, and asynchronous bulk log shipping with automatic backoff and retry, request-scoped log context, and Express.js middleware integration.

---

## Features

- **🚀 High Performance:** Asynchronously batches and flushes logs to minimize network overhead and avoid blocking the main event loop.
- **🛡️ Resilience & Retries:** Handles network dropouts gracefully with exponential backoff and retry mechanisms.
- **⚡ Express.js Middleware:** Out-of-the-box middlewares for logging requests, tracking latencies, redacting sensitive parameters, and tracking uncaught Express controller exceptions.
- **👶 Contextual Child Loggers:** Create loggers with bound metadata (e.g., specific to a user session or service component) that gets appended to every log entry automatically.
- **🔒 Sensitive Data Redaction:** Automatically redacts fields containing sensitive information (e.g., `password`, `token`, `secret`, `card`, `cookie`, `authorization`) from logs.
- **📈 Self-Monitoring Metrics:** Call `.getMetrics()` at any time to inspect queue sizes, transport status, and retries.
- **💥 Uncaught Exception Handling:** Capture uncaught errors or unhandled promise rejections globally and flush them before the application terminates.

---

## Installation

Install the package via npm:

```bash
npm install @utkarshpayal/logsense-node
```

Or via yarn:

```bash
yarn add @utkarshpayal/logsense-node
```

---

## Quick Start

### 1. Basic Initialization & Logging

Configure and instantiate the logger in your application:

```typescript
import { LogSense } from "@utkarshpayal/logsense-node";

const logger = new LogSense({
  apiKey: "your-logsense-api-key",
  service: "payment-service",
  environment: "production",
  batchSize: 50,                // Flush automatically after 50 logs...
  flushInterval: 5000,          // ...or every 5 seconds (whichever comes first)
});

// Logging at different levels
logger.info("Application started");
logger.debug("Database query took 12ms", { queryTime: 12 });
logger.warn("High memory utilization detected", { memoryUsage: "82%" });
logger.error("Failed to query payment API");
```

### 2. Context & Child Loggers

You can set global context metadata to be included in every log, or create child loggers to bound component/request-level context:

```typescript
// Set global context for all future logs
logger.setContext({
  version: "2.1.0",
  region: "us-west-2",
});

// Create a child logger for a specific component
const checkoutLogger = logger.child({ component: "CheckoutWorkflow" });

// This log will automatically contain global context (version, region) AND child context (component)
checkoutLogger.info("Customer initialized checkout", { cartId: "cart_8829" });
```

### 3. Capture Exceptions

Capture and log caught exceptions easily:

```typescript
try {
  throw new Error("Connection timed out to third-party provider");
} catch (error) {
  logger.captureException(error, { provider: "Stripe" });
}
```

---

## Express.js Integration

LogSense provides out-of-the-box middlewares for request tracing and error logging in Express applications.

```typescript
import express from "express";
import { LogSense, logsenseMiddleware, logsenseErrorMiddleware } from "@utkarshpayal/logsense-node";

const app = express();
const logger = new LogSense({
  apiKey: "your-logsense-api-key",
  service: "web-gateway"
});

// Register request logging middleware (adds unique request ID & child logger)
app.use(logsenseMiddleware(logger));

// Body parsing
app.use(express.json());

app.get("/api/users/:id", (req, res) => {
  // Use the request-scoped child logger! 
  // It automatically links logs with the generated x-request-id
  req.log?.info("Fetching user profile data", { targetUserId: req.params.id });
  
  res.json({ id: req.params.id, name: "John Doe" });
});

// Register error handling middleware (must be registered AFTER all routes)
app.use(logsenseErrorMiddleware(logger));

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
```

---

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `""` | **Required.** Your LogSense project write key. |
| `endpoint` | `string` | `"http://localhost:5000/logs"` | LogSense ingestion endpoint. |
| `batchSize` | `number` | `100` | Number of logs to batch before sending to the backend. |
| `flushInterval` | `number` | `5000` | How often (in milliseconds) to flush queued logs. |
| `service` | `string` | `""` | Name of the service producing logs (e.g. `auth-api`). |
| `environment` | `string` | `""` | Target environment (e.g. `production`, `staging`, `development`). |
| `maxQueueSize` | `number` | `10000` | Maximum number of logs allowed in memory before dropping new logs. |
| `compress` | `boolean` | `false` | Enable/disable GZIP compression on log payloads. |
| `timeout` | `number` | `5000` | Network request timeout (in milliseconds). |
| `customHeaders` | `Record<string, string>` | `{}` | Custom HTTP headers to include in ingestion requests. |
| `captureUnhandled` | `boolean` | `false` | Set to `true` to register handlers for uncaught exceptions and rejections. |
| `silent` | `boolean` | `false` | Set to `true` to disable internal stdout logging (console outputs). |

---

## Graceful Shutdown

To prevent losing logs in queue when your server is restarting or shutting down, trigger a graceful shutdown:

```typescript
// Flush all remaining logs and clean up workers/intervals
await logger.shutdown();
process.exit(0);
```

---

## Self-Monitoring Metrics

LogSense provides built-in metrics so you can track logging pipeline health in production:

```typescript
console.log(logger.getMetrics());
/*
Output format:
{
  queue: { size: 0, totalEnqueued: 1240, totalDropped: 0 },
  transport: { activeRequests: 0, totalSuccess: 42, totalFailed: 0 },
  retry: { pendingRetries: 0, totalRetriesTriggered: 0 }
}
*/
```

---

## License

ISC License. Copyright (c) 2026.
