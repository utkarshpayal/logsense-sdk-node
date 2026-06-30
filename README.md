# 📦 LogSense Node.js SDK

Official Node.js SDK for **LogSense**—an AI-powered observability and log analysis platform. This SDK provides auto-instrumentation middleware for Express applications, captures exceptions, redacts sensitive PII locally, and buffers logs in memory to transmit them asynchronously without impacting your application's request latency.

---

## ✨ Features

- **Auto-Instrumentation**: Plug-and-play Express middleware that automatically tracks route hits, request/response headers, body payloads, status codes, query strings, and response latency.
- **PII Redaction**: Automatically identifies and redacts sensitive keys (e.g. `password`, `token`, `secret`, `card`, `cookie`, `authorization`, `x-api-key`) in request bodies, queries, and headers before transmitting logs.
- **Context Preservation & Tracing**: Generates or propagates `trace_id` and `request_id` across request execution boundaries.
- **Request-Scoped Logging**: Attaches a contextual child logger (`req.log`) to incoming requests so all manual logs are automatically bound to the request's `trace_id`.
- **Asynchronous Batching**: Enqueues logs into a local memory buffer and flushes them in batches to the ingestion API to minimize network overhead and avoid blocking the event loop.
- **Resilient Transport**: Retries failed batch transmissions with exponential backoff if the ingestion endpoint is temporarily unreachable.
- **Graceful Shutdown**: Automatically registers handlers for standard termination signals (`SIGINT`, `SIGTERM`, `beforeExit`) to flush outstanding logs before exiting.

---

## 🚀 Installation

```bash
npm install @utkarshpayal/logsense-node
```

---

## 🛠️ Quick Start

### 1. Express Application Middleware Integration

To instrument your entire Express server, register the `logsenseMiddleware` at the top of your middleware stack, and the `logsenseErrorMiddleware` at the very bottom.

```typescript
import express from "express";
import { LogSense, logsenseMiddleware, logsenseErrorMiddleware } from "@utkarshpayal/logsense-node";

const app = express();

// 1. Initialize LogSense SDK
const logger = new LogSense({
    apiKey: "ls_live_your_api_key_here",
    service: "auth-service",
    environment: "production",
});

// 2. Parse request bodies BEFORE registering LogSense middleware
app.use(express.json());

// 3. Register auto-instrumentation middleware
app.use(logsenseMiddleware(logger));

// 4. Define your application routes
app.get("/api/users/:id", (req, res) => {
    // Write request-scoped logs tied automatically to the request's Trace ID
    req.log.info("Fetching user profile details", { userId: req.params.id });
    res.json({ id: req.params.id, name: "Alice" });
});

app.post("/api/checkout", (req, res) => {
    if (!req.body.paymentMethod) {
        throw new Error("Missing payment credentials");
    }
    res.json({ success: true });
});

// 5. Register the error logging middleware AFTER all routes, but BEFORE other error handlers
app.use(logsenseErrorMiddleware(logger));

// 6. Custom error fallback
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
});

app.listen(3000, () => {
    console.log("Server listening on port 3000");
});
```

---

## ⚙️ Configuration Options

Instantiate the logger by passing a configuration object to `LogSense`:

```typescript
const logger = new LogSense(options: LoggerOptions);
```

### `LoggerOptions` Specifications

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`apiKey`** (Required) | `string` | — | Access key generated from the LogSense Web Dashboard. |
| **`service`** | `string` | `"node-service"` | Name of the microservice (e.g. `auth-service`, `payment-gateway`). |
| **`environment`** | `string` | `"development"` | Application environment scope (e.g. `development`, `staging`, `production`). |
| **`endpoint`** | `string` | `"http://localhost:5000/api/logs"` | Target URL of the LogSense server ingestion API endpoint. |
| **`batchSize`** | `number` | `50` | Maximum number of log lines bundled together into a single HTTP post batch. |
| **`flushInterval`** | `number` | `2000` | Buffer flush frequency in milliseconds. |
| **`maxQueueSize`** | `number` | `10000` | Maximum capacity of the local log queue before dropping new items. |
| **`compress`** | `boolean` | `false` | Whether to compress payload data before transport. |
| **`timeout`** | `number` | `5000` | Network request timeout for sending logs. |
| **`silent`** | `boolean` | `false` | If set to `true`, disables console mirroring of logs. |
| **`captureUnhandled`** | `boolean` | `true` | When `true`, automatically logs uncaught exceptions and unhandled promise rejections. |

---

## 📖 API Documentation

### Logger Methods

You can call standard logging methods globally on your `LogSense` instance:

```typescript
// Logging levels
logger.trace(message: string, metadata?: Record<string, unknown>);
logger.debug(message: string, metadata?: Record<string, unknown>);
logger.info(message: string, metadata?: Record<string, unknown>);
logger.warn(message: string, metadata?: Record<string, unknown>);
logger.error(message: string, metadata?: Record<string, unknown>);
logger.fatal(message: string, metadata?: Record<string, unknown>);
```

### Capturing Exceptions

Manually log error stack traces and exceptions:

```typescript
try {
    throw new Error("Database query connection failed");
} catch (error) {
    logger.captureException(error, { query: "SELECT * FROM users;" });
}
```

### Context and Child Loggers

You can create a sub-logger inheriting current settings and adding scoped context variables:

```typescript
// Set global static fields for the logger instance
logger.setContext({ region: "us-east-1", release: "v1.2.0" });

// Create a child logger for a specific workflow
const taskLogger = logger.child({ taskId: "job_94101" });
taskLogger.info("Starting batch task execution"); // Meta automatically contains taskId, region, and release.
```

### Request-Scoped Logging in Express

When using `logsenseMiddleware`, a specialized child logger is attached to the request object:

```typescript
app.get("/orders", (req, res) => {
    req.log.info("User requested orders catalog list"); 
    // Console Output:
    // [LogSense] [2026-06-30T15:00:00Z] [INFO] User requested orders catalog list {"requestId":"...","traceId":"...","method":"GET","url":"/orders"}
});
```

---

## 🛡️ Graceful Shutdown

To prevent log loss when a service restarts or terminates, the SDK automatically registers handlers to flush buffers. If you need to manually handle exit routines, you can call `.shutdown()`:

```typescript
// Flush any queued logs and close transport channels
await logger.shutdown();
```
