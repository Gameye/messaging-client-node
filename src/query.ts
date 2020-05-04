import { AbortSignal } from "abort-controller";
import { FluxStandardAction } from "flux-standard-action";
import * as createHttpError from "http-errors";
import { second } from "msecs";
import fetch from "node-fetch";
import * as querystring from "querystring";
import * as readline from "readline";

export interface EventStreamRequestConfig {
    heartbeatInterval?: number;
    timeout?: number;
    accessToken?: string;
    signal?: AbortSignal;
}

export async function* executeQuery<T extends FluxStandardAction<string, unknown>>(
    url: string,
    payload: T["payload"] = {},
    options?: EventStreamRequestConfig,
) {
    const headers: HeadersInit = {
        "Accept": "application/x-ndjson",
        "x-heartbeat-interval": String(options?.heartbeatInterval ?? 20 * second),
    };
    if (options?.accessToken) {
        headers.Authorization = `Bearer: ${options.accessToken}`;
    }

    const search = querystring.stringify(payload as querystring.ParsedUrlQueryInput);
    const response = await fetch(
        url + (search ? `?${search}` : ""),
        {
            headers,
            timeout: options?.timeout,
            signal: options?.signal,
        },
    )

    if (!response.ok) throw createHttpError(response.status);

    const lines = readline.createInterface({
        input: response.body,
        crlfDelay: Infinity,
    })

    for await (const line of lines) {
        const event = JSON.parse(line);
        yield event;
    }
}
