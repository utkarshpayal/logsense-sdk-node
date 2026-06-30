import { LogEntry } from "./types";

export interface QueueMetrics {
    currentSize: number;
    enqueuedCount: number;
    dequeuedCount: number;
    droppedCount: number;
}

export class LogQueue {
    private readonly queue: LogEntry[] = [];
    private enqueuedCount = 0;
    private dequeuedCount = 0;
    private droppedCount = 0;

    constructor(private readonly maxQueueSize: number = 10000) {}

    enqueue(log: LogEntry): void {
        if (this.queue.length >= this.maxQueueSize) {
            // Drop oldest log when full
            const dropped = this.queue.shift();
            if (dropped) {
                this.droppedCount++;
            }
        }
        this.queue.push(log);
        this.enqueuedCount++;
    }

    enqueueMany(logs: LogEntry[]): void {
        for (const log of logs) {
            this.enqueue(log);
        }
    }

    dequeue(): LogEntry | undefined {
        const log = this.queue.shift();
        if (log) {
            this.dequeuedCount++;
        }
        return log;
    }

    dequeueMany(count: number): LogEntry[] {
        const logs = this.queue.splice(0, count);
        this.dequeuedCount += logs.length;
        return logs;
    }

    peek(): LogEntry | undefined {
        return this.queue[0];
    }

    size(): number {
        return this.queue.length;
    }

    isEmpty(): boolean {
        return this.queue.length === 0;
    }

    clear(): void {
        this.queue.length = 0;
    }

    getAll(): LogEntry[] {
        return [...this.queue];
    }

    getMetrics(): QueueMetrics {
        return {
            currentSize: this.queue.length,
            enqueuedCount: this.enqueuedCount,
            dequeuedCount: this.dequeuedCount,
            droppedCount: this.droppedCount,
        };
    }
}