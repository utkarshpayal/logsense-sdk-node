import axios from "axios";
import { LogQueue } from "./queue";
import { Transport } from "./transport";
import { LoggerOptions } from "./types";
import { RetryManager } from "./retry";

export class BatchManager {
    private readonly timer: NodeJS.Timeout | null = null;
    private readonly retryManager: RetryManager;
    private activeFlushPromise: Promise<void> | null = null;

    constructor(
        private readonly queue: LogQueue,
        private readonly transport: Transport,
        private readonly config: Required<LoggerOptions>
    ) {
        this.retryManager = new RetryManager(this.transport);

        if (this.config.flushInterval > 0) {
            this.timer = setInterval(() => {
                void this.flush();
            }, this.config.flushInterval);

            // Avoid keeping the process alive solely for this interval
            if (this.timer && typeof this.timer.unref === "function") {
                this.timer.unref();
            }
        }
    }

    async add(): Promise<void> {
        if (this.queue.size() >= this.config.batchSize) {
            await this.flush();
        }
    }

    async flush(): Promise<void> {
        if (this.activeFlushPromise) {
            return this.activeFlushPromise;
        }

        this.activeFlushPromise = this.performFlush();
        try {
            await this.activeFlushPromise;
        } finally {
            this.activeFlushPromise = null;
        }
    }

    async shutdown(): Promise<void> {
        if (this.timer) {
            clearInterval(this.timer);
        }

        // Wait for any active flush to finish first
        if (this.activeFlushPromise) {
            try {
                await this.activeFlushPromise;
            } catch (err) {}
        }

        // Flush all remaining logs in batches
        // To prevent infinite loop on persistent failure, check if we make progress.
        let lastQueueSize = this.queue.size();
        while (!this.queue.isEmpty()) {
            await this.performFlush();
            const currentSize = this.queue.size();
            if (currentSize >= lastQueueSize) {
                break;
            }
            lastQueueSize = currentSize;
        }

        // Abort any remaining active connections
        this.transport.abortActiveRequests();
    }

    getRetryMetrics() {
        return this.retryManager.getMetrics();
    }

    private async performFlush(): Promise<void> {
        if (this.queue.isEmpty()) {
            return;
        }

        const logs = this.queue.dequeueMany(this.config.batchSize);

        try {
            await this.retryManager.send(logs);
        } catch (error: any) {
            if (!this.config.silent) {
                console.error("❌ LogSense: Failed to flush logs:", error.message || error);
            }
            
            // Do not put logs back in queue for non-retryable client errors (like 401 Unauthorized / Invalid API Key)
            const isNonRetryable = axios.isAxiosError(error) &&
                error.response &&
                (error.response.status === 400 ||
                 error.response.status === 401 ||
                 error.response.status === 403 ||
                 error.response.status === 404);

            if (isNonRetryable) {
                if (!this.config.silent) {
                    console.error("⚠️ LogSense: Dropping logs due to non-retryable client error.");
                }
                return;
            }

            // Put logs back in queue so they are not lost for transient/server errors
            this.queue.enqueueMany(logs);
        }
    }
}