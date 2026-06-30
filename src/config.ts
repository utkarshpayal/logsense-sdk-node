import { LoggerOptions } from "./types";

export const DEFAULT_CONFIG: Required<LoggerOptions> = {
    apiKey: "",
    endpoint: "http://localhost:5000/logs",
    batchSize: 100,
    flushInterval: 5000,
    service: "",
    environment: "",
    maxQueueSize: 10000,
    compress: false,
    timeout: 5000,
    customHeaders: {},
    captureUnhandled: false,
    silent: false,
};