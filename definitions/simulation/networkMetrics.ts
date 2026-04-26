export type QueueSample = {
    batchIndex: number;
    queueLength: number;
};

export type QueueMetricsState = {
    totalBatches: number;
    totalDuration: number;
    samples: QueueSample[];
};
