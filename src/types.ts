export type LogLevel =
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "fatal";

export interface LoggerOptions {
    apiKey: string;

    endpoint?: string;

    batchSize?: number;

    flushInterval?: number;

    service?: string;

    environment?: string;

    maxQueueSize?: number;

    compress?: boolean;

    timeout?: number;

    customHeaders?: Record<string, string>;

    captureUnhandled?: boolean;

    silent?: boolean;
}

export interface LogEntry {
    level: LogLevel;

    message: string;

    timestamp: string;

    service?: string;

    environment?: string;

    metadata?: Record<string, unknown>;

    traceId?: string;

    requestId?: string;

    hostname?: string;
}