import axios from "axios";
import { LogEntry } from "./types";
import { Transport } from "./transport";

export interface RetryMetrics {
    totalRetries: number;
    failedRetries: number;
}

export class RetryManager {
    private totalRetries = 0;
    private failedRetries = 0;

    constructor(
        private readonly transport: Transport,
        private readonly maxRetries = 5,
        private readonly baseDelay = 1000
    ) {}

    async send(logs: LogEntry[]): Promise<void> {
        let attempt = 0;

        while (attempt <= this.maxRetries) {
            try {
                await this.transport.send(logs);
                return;
            } catch (error: any) {
                if (!this.isRetryable(error)) {
                    console.error("❌ Non-retryable error encountered, throwing immediately:", error.message || error);
                    throw error;
                }

                attempt++;
                this.totalRetries++;

                if (attempt > this.maxRetries) {
                    this.failedRetries++;
                    console.error(`❌ Failed to send logs after ${this.maxRetries} attempts`);
                    throw error;
                }

                // Exponential backoff: baseDelay * 2^(attempt-1) + jitter
                let delay = this.baseDelay * Math.pow(2, attempt - 1);
                // Add Jitter (0 to 100ms)
                const jitter = Math.random() * 100;
                delay = delay + jitter;

                console.warn(`⚠️ LogSense: Retrying request (attempt ${attempt}/${this.maxRetries}) in ${Math.round(delay)}ms...`);
                await this.sleep(delay);
            }
        }
    }

    getMetrics(): RetryMetrics {
        return {
            totalRetries: this.totalRetries,
            failedRetries: this.failedRetries,
        };
    }

    private isRetryable(error: any): boolean {
        // If it's not an Axios error, retry by default (e.g. timeout, connection reset, socket hang up)
        if (!axios.isAxiosError(error)) {
            return true;
        }

        // If there's no response from the server, it's a network/DNS error, so it is retryable
        if (!error.response) {
            return true;
        }

        const status = error.response.status;

        // Retry on 408 (Timeout), 429 (Too Many Requests), and 5xx (Server Errors)
        if (status === 408 || status === 429 || status >= 500) {
            return true;
        }

        // Do not retry client errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, etc.)
        return false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}