import { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from "express";
import { v4 as uuidv4 } from "uuid";
import { LogSense } from "./logger";
import { LoggerOptions } from "./types";

// Extend Express Request type to include request-scoped logger and ID
declare global {
    namespace Express {
        interface Request {
            log?: LogSense;
            id?: string;
        }
    }
}

/**
 * Recursively redacts sensitive keys from objects to prevent logging credentials/secrets
 */
function redactSensitive(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(redactSensitive);
    }
    
    const redacted: Record<string, any> = {};
    const sensitiveKeys = ["password", "token", "secret", "card", "authorization", "cookie", "x-api-key", "key"];
    
    for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
            redacted[key] = "[REDACTED]";
        } else if (typeof value === "object") {
            redacted[key] = redactSensitive(value);
        } else {
            redacted[key] = value;
        }
    }
    
    return redacted;
}

/**
 * Express middleware to log incoming requests, generate request IDs,
 * track response latency, and attach a request-scoped child logger.
 */
export function logsenseMiddleware(loggerOrOptions: LogSense | LoggerOptions): RequestHandler {
    const logger = loggerOrOptions instanceof LogSense
        ? loggerOrOptions
        : new LogSense(loggerOrOptions);

    return (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        const requestId = (req.headers["x-request-id"] as string) || uuidv4();
        
        req.id = requestId;
        res.setHeader("x-request-id", requestId);

        // Create a child logger for this request context
        const reqLogger = logger.child({
            requestId,
            method: req.method,
            url: req.path,
        });

        // Attach request-scoped logger to request object
        req.log = reqLogger;

        // Capture request body (if parsed)
        let requestBody: any = undefined;
        if (req.body) {
            requestBody = redactSensitive(req.body);
        }

        // Log request receipt
        reqLogger.info(`--> ${req.method} ${req.path}`, {
            query: redactSensitive(req.query),
            headers: redactSensitive(req.headers),
            body: requestBody,
            ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
            userAgent: req.headers["user-agent"],
        });

        // Intercept response body
        let resBody: any = undefined;
        const originalSend = res.send;
        res.send = function (chunk: any) {
            if (chunk) {
                if (typeof chunk === "string") {
                    try {
                        resBody = JSON.parse(chunk);
                    } catch (e) {
                        resBody = chunk;
                    }
                } else if (Buffer.isBuffer(chunk)) {
                    try {
                        resBody = JSON.parse(chunk.toString("utf8"));
                    } catch (e) {
                        resBody = chunk.toString("utf8");
                    }
                } else {
                    resBody = chunk;
                }
            }
            return originalSend.apply(this, arguments as any);
        };

        // Intercept response finish
        res.on("finish", () => {
            const duration = Date.now() - startTime;
            const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
            
            let safeResBody = redactSensitive(resBody);
            if (typeof safeResBody === "string" && safeResBody.length > 1000) {
                safeResBody = safeResBody.substring(0, 1000) + "... [TRUNCATED]";
            }

            reqLogger.captureMessage(`<-- ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, level, {
                statusCode: res.statusCode,
                durationMs: duration,
                responseBody: safeResBody,
                responseHeaders: redactSensitive(res.getHeaders()),
            });
        });

        next();
    };
}

/**
 * Express error logging middleware.
 * Must be registered AFTER all routes.
 */
export function logsenseErrorMiddleware(logger: LogSense): ErrorRequestHandler {
    return (err: any, req: Request, res: Response, next: NextFunction) => {
        const reqLogger = req.log || logger;
        
        reqLogger.captureException(err, {
            context: "express-error-handler",
            path: req.path,
            method: req.method,
        });
        
        next(err);
    };
}
