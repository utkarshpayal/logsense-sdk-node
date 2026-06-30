import { BatchManager } from "./batch";
import { DEFAULT_CONFIG } from "./config";
import { LogQueue } from "./queue";
import { Transport } from "./transport";
import { getHostname, now } from "./utils";
import { LogEntry, LoggerOptions, LogLevel } from "./types";

export class LogSense {
    private readonly config: Required<LoggerOptions>;
    private readonly queue: LogQueue;
    private readonly transport: Transport;
    private readonly batchManager: BatchManager;
    private readonly context: Record<string, unknown> = {};
    private readonly isChild: boolean = false;

    constructor(
        options: LoggerOptions,
        _childContext?: { context: Record<string, unknown>; parent: LogSense }
    ) {
        if (_childContext) {
            this.isChild = true;
            this.config = _childContext.parent.config;
            this.queue = _childContext.parent.queue;
            this.transport = _childContext.parent.transport;
            this.batchManager = _childContext.parent.batchManager;
            this.context = {
                ..._childContext.parent.context,
                ..._childContext.context,
            };
            return;
        }

        this.config = {
            ...DEFAULT_CONFIG,
            ...options,
        };

        if (!this.config.apiKey) {
            throw new Error("LogSense API key is required.");
        }

        this.queue = new LogQueue(this.config.maxQueueSize);
        this.transport = new Transport(this.config);
        this.batchManager = new BatchManager(
            this.queue,
            this.transport,
            this.config
        );

        this.registerExitHandlers();
    }

    private registerExitHandlers() {
        process.on("beforeExit", async () => {
            await this.shutdown();
        });

        process.on("SIGINT", async () => {
            await this.shutdown();
            process.exit(0);
        });

        process.on("SIGTERM", async () => {
            await this.shutdown();
            process.exit(0);
        });

        if (this.config.captureUnhandled) {
            process.on("uncaughtException", async (error) => {
                this.captureException(error, { unhandled: true });
                await this.shutdown();
                process.exit(1);
            });

            process.on("unhandledRejection", async (reason) => {
                this.captureException(reason, { unhandled: true });
                await this.shutdown();
            });
        }
    }

    trace(message: string, metadata?: Record<string, unknown>) {
        this.write("trace", message, metadata);
    }

    debug(message: string, metadata?: Record<string, unknown>) {
        this.write("debug", message, metadata);
    }

    info(message: string, metadata?: Record<string, unknown>) {
        this.write("info", message, metadata);
    }

    warn(message: string, metadata?: Record<string, unknown>) {
        this.write("warn", message, metadata);
    }

    error(message: string, metadata?: Record<string, unknown>) {
        this.write("error", message, metadata);
    }

    fatal(message: string, metadata?: Record<string, unknown>) {
        this.write("fatal", message, metadata);
    }

    setContext(metadata: Record<string, unknown>): void {
        Object.assign(this.context, metadata);
    }

    child(metadata: Record<string, unknown>): LogSense {
        return new LogSense(this.config, { context: metadata, parent: this });
    }

    captureException(error: unknown, metadata?: Record<string, unknown>) {
        let message = "An error occurred";
        let stack: string | undefined;
        let errMetadata: Record<string, unknown> = {};

        if (error instanceof Error) {
            message = error.message;
            stack = error.stack;
            errMetadata = {
                error_name: error.name,
                error_stack: stack,
            };
        } else if (typeof error === "string") {
            message = error;
        } else {
            message = String(error);
        }

        this.write("error", message, {
            ...errMetadata,
            ...metadata,
        });
    }

    captureMessage(
        message: string,
        level: LogLevel = "info",
        metadata?: Record<string, unknown>
    ) {
        this.write(level, message, metadata);
    }

    private write(
        level: LogLevel,
        message: string,
        metadata?: Record<string, unknown>
    ) {
        const log: LogEntry = {
            level,
            message,
            timestamp: now(),
            hostname: getHostname(),
            metadata: {
                ...this.context,
                ...metadata,
            },
        };

        if (this.config.service) {
            log.service = this.config.service;
        }

        if (this.config.environment) {
            log.environment = this.config.environment;
        }

        if (!this.config.silent) {
            const metaStr = Object.keys(log.metadata || {}).length
                ? JSON.stringify(log.metadata)
                : "";
            console.log(
                `[LogSense] [${log.timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`
            );
        }

        this.queue.enqueue(log);
        void this.batchManager.add();
    }

    async flush() {
        await this.batchManager.flush();
    }

    async shutdown() {
        await this.batchManager.shutdown();
    }

    async close() {
        await this.shutdown();
    }

    getMetrics() {
        return {
            queue: this.queue.getMetrics(),
            transport: this.transport.getMetrics(),
            retry: this.batchManager.getRetryMetrics(),
        };
    }
}