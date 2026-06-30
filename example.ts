import { LogSense, logsenseMiddleware, logsenseErrorMiddleware } from "./src";
import express from "express";
import axios from "axios";

async function main() {
    console.log("=== LogSense SDK V2 Verification ===");

    // 1. Initialize LogSense SDK with Advanced Configuration
    const logger = new LogSense({
        apiKey: "lsk_31a0f207c577848ff73fe610148c3b2d0b091f6aed7f1443fab183cfc3775fab",
        service: "payment-service",
        environment: "development",
        compress: true,             // Enable GZIP compression
        captureUnhandled: true,     // Capture global crashes
        silent: false,              // Log to console as well
        batchSize: 5,               // Trigger flush quickly
    });

    // 2. Test Logging Levels
    logger.trace("This is a trace log");
    logger.debug("Debugging database connection state");
    logger.info("Server started successfully");
    logger.warn("Redis memory utilization reached 75%");
    logger.fatal("System out of memory! Shutting down worker");

    // 3. Test Global Context
    logger.setContext({
        version: "2.0.0",
        region: "us-west-2",
    });
    logger.info("Logged with global context metadata");

    // 4. Test Child Loggers
    const checkoutLogger = logger.child({ component: "CheckoutProcess" });
    checkoutLogger.info("Checkout process initialized", { orderId: "ord_10293" });

    // 5. Test Exception Capture
    try {
        throw new Error("Unable to reach payment gateway API");
    } catch (err) {
        checkoutLogger.captureException(err, { paymentGateway: "stripe" });
    }

    // 6. Test Express Middleware integration
    console.log("\n=== Starting Express Middleware Test ===");
    const app = express();

    // Register LogSense request logger
    app.use(logsenseMiddleware(logger));

    app.get("/api/checkout", (req, res) => {
        // Log using request-scoped logger
        req.log?.info("Processing item validations", { itemId: "item_99" });
        res.status(200).json({ success: true, message: "Order processed" });
    });

    app.get("/api/error", (req, res, next) => {
        next(new Error("Simulated express controller crash"));
    });

    // Register LogSense error logger
    app.use(logsenseErrorMiddleware(logger));

    // Start a temporary local server to test the middleware
    const server = app.listen(9090, async () => {
        console.log("Express test server listening on port 9090");

        try {
            // Trigger a successful request
            console.log("\n--> Sending GET /api/checkout...");
            await axios.get("http://localhost:9090/api/checkout");

            // Trigger a failing request
            console.log("\n--> Sending GET /api/error...");
            await axios.get("http://localhost:9090/api/error").catch((e) => {
                // Ignore expected 500 error response
            });
        } catch (e: any) {
            console.error("Test requests failed:", e.message);
        } finally {
            console.log("\n=== Shutting Down Server and Logger ===");
            // Gracefully close Express server
            server.close(async () => {
                console.log("Express test server stopped");

                // Print metrics before shutdown
                console.log("\n=== Logger Metrics ===\n", JSON.stringify(logger.getMetrics(), null, 2));

                // Gracefully shut down and flush logs
                await logger.close();
                console.log("LogSense logger shut down and all logs flushed.");
            });
        }
    });
}

main().catch(console.error);