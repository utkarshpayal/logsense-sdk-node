import axios, { AxiosInstance } from "axios";
import http from "http";
import https from "https";
import zlib from "zlib";
import { LogEntry, LoggerOptions } from "./types";

export interface TransportMetrics {
    totalRequests: number;
    succeededRequests: number;
    failedRequests: number;
    totalLatencyMs: number;
    averageLatencyMs: number;
}

export class Transport {
    private readonly client: AxiosInstance;
    private readonly activeControllers = new Set<AbortController>();

    private totalRequests = 0;
    private succeededRequests = 0;
    private failedRequests = 0;
    private totalLatencyMs = 0;

    constructor(private readonly config: Required<LoggerOptions>) {
        const isHttps = config.endpoint.startsWith("https");
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        this.client = axios.create({
            baseURL: config.endpoint,
            timeout: config.timeout,
            httpAgent,
            httpsAgent,
            headers: {
                "Content-Type": "application/json",
                "x-api-key": config.apiKey,
                ...config.customHeaders,
            },
        });
    }

    async send(logs: LogEntry[]): Promise<void> {
        if (logs.length === 0) {
            return;
        }

        const promises = logs.map(async (log) => {
            const controller = new AbortController();
            this.activeControllers.add(controller);

            let level = log.level;
            const metadata = { ...log.metadata };

            if (level === "trace") {
                level = "debug" as any;
                metadata.original_level = "trace";
            } else if (level === "fatal") {
                level = "error" as any;
                metadata.original_level = "fatal";
            }

            const payload = {
                level,
                message: log.message,
                service: log.service,
                environment: log.environment,
                metadata,
                traceId: log.traceId,
                requestId: log.requestId,
                hostname: log.hostname,
            };

            let data: any = JSON.stringify(payload);
            const headers: Record<string, string> = {};

            if (this.config.compress) {
                data = zlib.gzipSync(Buffer.from(data));
                headers["Content-Encoding"] = "gzip";
                headers["Content-Type"] = "application/json";
            }

            const startTime = Date.now();
            this.totalRequests++;

            try {
                await this.client.post("", data, {
                    signal: controller.signal,
                    headers,
                });
                this.succeededRequests++;
            } catch (error: any) {
                this.failedRequests++;
                // If it's an axios error, add extra logging info
                if (axios.isAxiosError(error)) {
                    console.error("❌ LogSense post error status:", error.response?.status, error.response?.data || error.message);
                }
                throw error;
            } finally {
                const latency = Date.now() - startTime;
                this.totalLatencyMs += latency;
                this.activeControllers.delete(controller);
            }
        });

        await Promise.all(promises);
        console.log(`🚀 Sent ${logs.length} logs`);
    }

    abortActiveRequests(): void {
        for (const controller of this.activeControllers) {
            controller.abort();
        }
        this.activeControllers.clear();
    }

    getMetrics(): TransportMetrics {
        return {
            totalRequests: this.totalRequests,
            succeededRequests: this.succeededRequests,
            failedRequests: this.failedRequests,
            totalLatencyMs: this.totalLatencyMs,
            averageLatencyMs: this.totalRequests > 0 ? this.totalLatencyMs / this.totalRequests : 0,
        };
    }
}