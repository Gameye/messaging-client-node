import { ReReadable } from "@gameye/streamkit";
import { FluxStandardAction } from "flux-standard-action";
import { OutgoingHttpHeaders } from "http";
import { second } from "msecs";
import * as querystring from "querystring";
import { pipeline, Readable } from "stream";
import { EndStream, FromJSONTransform, SplitTransform } from "../streams";
import { createRequestStream, defaultRetryConfig, getResponse, retry, RetryConfig } from "../utils";

export interface EventStreamRequestConfig {
    heartbeatInterval?: number;
    timeout?: number;
    accessToken?: string;
}

export const defaultRequestConfig = {
    heartbeatInterval: 10 * second,
    timeout: 20 * second,
};

export async function createHttpEventStream<T extends FluxStandardAction<string, any>>(
    url: string,
    payload: T["payload"] = {},
    options: EventStreamRequestConfig = {},
): Promise<Readable> {
    const config = {
        ...defaultRequestConfig,
        ...options,
    } as EventStreamRequestConfig & typeof defaultRequestConfig;

    const headers: OutgoingHttpHeaders = {
        "Accept": "application/x-ndjson",
        "x-heartbeat-interval": String(config.heartbeatInterval),
    };
    if (config.accessToken) {
        headers.Authorization = `Bearer: ${config.accessToken}`;
    }

    const search = querystring.stringify(payload);
    const requestStream = createRequestStream(
        "GET",
        new URL(url + (search ? `?${search}` : "")),
        headers,
        config.timeout,
    );

    try {
        requestStream.end();

        const responseStream = await getResponse(requestStream);
        try {
            const split = new SplitTransform();
            const fromJson = new FromJSONTransform();
            const sink = new EndStream({
                objectMode: true,
            });

            pipeline(
                responseStream,
                split,
                fromJson,
                sink,
                error => {
                    requestStream.abort();
                    requestStream.destroy();
                    sink.destroy(error || undefined);
                },
            );

            return sink;
        }
        catch (error) {
            responseStream.destroy();
            throw error;
        }
    }
    catch (error) {
        requestStream.abort();
        requestStream.destroy();
        throw error;
    }
}

export type EventStreamRequestRetryConfig = EventStreamRequestConfig & RetryConfig;

export const defaultRequestRetryConfig = {
    ...defaultRetryConfig,
    ...defaultRequestConfig,
};

export function createHttpEventStreamRetry<T extends FluxStandardAction<string, any>>(
    url: string,
    payload: T["payload"] = {},
    options: EventStreamRequestRetryConfig = {},
): Readable {
    const config = {
        ...options,
        ...defaultRequestRetryConfig,
    } as EventStreamRequestRetryConfig & typeof defaultRequestRetryConfig;

    const {
        heartbeatInterval, timeout, accessToken,
        retryLimit, intervalCap, intervalBase,
    } = config;

    return new ReReadable(
        () => retry(
            () => createHttpEventStream(
                url,
                payload,
                {
                    heartbeatInterval,
                    timeout,
                    accessToken,
                },
            ),
            {
                retryLimit,
                intervalCap,
                intervalBase,
            },
            error => (error.statusCode && error.statusCode >= 500),
        ),
        { objectMode: true },
    );
}
