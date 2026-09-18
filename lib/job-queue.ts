import { randomUUID } from "node:crypto";

export type QueueJobType = "transcribe" | "render" | "highlight-detect";

export interface TypedJob<T = unknown> {
  id: string;
  type: QueueJobType;
  payload: T;
  createdAt: string;
  status: "queued" | "running" | "done" | "failed";
}

const queue: TypedJob[] = [];

export const jobQueue = {
  enqueue<T>(job: Omit<TypedJob<T>, "id" | "createdAt" | "status">) {
    const queuedJob: TypedJob<T> = {
      ...job,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "queued",
    };

    queue.push(queuedJob);
    return queuedJob;
  },
  list() {
    return [...queue];
  },
  next() {
    return queue.shift();
  },
};
