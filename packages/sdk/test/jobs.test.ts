import { describe, expect, it, vi } from "vitest";
import { APIUserAbortError, isTerminal, JobTimeoutError } from "../src/index.js";
import { client, job, json, mockFetch } from "./helpers.js";

describe("jobs.wait", () => {
    it("polls GET /jobs/{id} until the job finishes", async () => {
        const { fetch, calls } = mockFetch(json(200, job("QUEUED")), json(200, job("RUNNING")), json(200, job("SUCCEEDED")));
        const seen: string[] = [];
        const onPoll = vi.fn((j: { status: string }): void => {
            seen.push(j.status);
        });
        const done = await client(fetch).jobs.wait("job_1", { intervalMs: 1, onPoll });
        expect(done.status).toBe("SUCCEEDED");
        expect(calls).toHaveLength(3);
        expect(calls.every((c) => c.url.pathname === "/api/v1/jobs/job_1")).toBe(true);
        expect(seen).toEqual(["QUEUED", "RUNNING", "SUCCEEDED"]);
    });

    it("accepts the job returned by a 202 call", async () => {
        const { fetch } = mockFetch(json(202, job("QUEUED", "job_9")), json(200, job("FAILED", "job_9")));
        const horus = client(fetch);
        const queued = await horus.accounts.jobs.create("acc_1", { kind: "VERIFY_SESSION" });
        const done = await horus.jobs.wait(queued, { intervalMs: 1 });
        expect(done).toMatchObject({ id: "job_9", status: "FAILED" });
    });

    it("throws JobTimeoutError when the job does not finish in time", async () => {
        const { fetch } = mockFetch(json(200, job("RUNNING")));
        const err: unknown = await client(fetch).jobs.wait("job_1", { timeoutMs: 20, intervalMs: 5 }).catch((e: unknown): unknown => e);
        expect(err).toBeInstanceOf(JobTimeoutError);
        expect(err).toMatchObject({ jobId: "job_1", lastStatus: "RUNNING" });
    });

    it("can be aborted", async () => {
        const { fetch } = mockFetch(json(200, job("RUNNING")));
        const ac = new AbortController();
        const p = client(fetch).jobs.wait("job_1", { intervalMs: 10_000, signal: ac.signal });
        setTimeout(() => ac.abort(), 5);
        await expect(p).rejects.toBeInstanceOf(APIUserAbortError);
    });

    it("keeps the generated job methods", () => {
        const { fetch } = mockFetch(json(200, {}));
        const jobs = client(fetch).jobs;
        expect(typeof jobs.get).toBe("function");
        expect(typeof jobs.list).toBe("function");
        expect(typeof jobs.cancel).toBe("function");
    });

    it("knows terminal statuses", () => {
        expect(["SUCCEEDED", "FAILED", "CANCELLED"].every((s) => isTerminal({ status: s as "FAILED" }))).toBe(true);
        expect(isTerminal({ status: "CLAIMED" })).toBe(false);
    });
});
