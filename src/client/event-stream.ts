import { FluxStandardAction } from "flux-standard-action";
import { OutgoingHttpHeaders } from "http";
import { second } from "msecs";
import { retry, RetryConfig } from "promise-u";
import { CancellationController } from "promise-u";
import * as querystring from "querystring";
import { pipeline, Readable } from "stream";
import { EndStream, FromJSONTransform, ReReadable, SplitTransform } from "../streams";
import { createRequestStream, getResponse } from "../utils";

export type EventStreamRequestRetryConfig = EventStreamRequestConfig & RetryConfig;

export function createHttpEventStreamRetry<T extends FluxStandardAction<string, any>>(
    url: string,
    payload: T["payload"] = {},
    options?: EventStreamRequestRetryConfig,
): Readable {
    const { heartbeatInterval, timeout, accessToken, ...retryOptions } = options || {};
    const { retryLimit, intervalCap, intervalBase, ...requestOptions } = options || {};

    const sink = new EndStream({ objectMode: true });

    const cancellation = new CancellationController();
    const stream = new ReReadable(
        () => retry(
            () => createHttpEventStream(
                url,
                payload,
                requestOptions,
            ),
            retryOptions,
            error => (error.statusCode && error.statusCode >= 500),
            cancellation,
        ),
        { objectMode: true },
    );
    stream.on("close", () => cancellation.cancel());

    pipeline(
        stream,
        sink,
        error => sink.destroy(error || undefined),
    );

    return sink;
}

export interface EventStreamRequestConfig {
    heartbeatInterval?: number;
    timeout?: number;
    accessToken?: string;
}

const defaultRequestConfig: EventStreamRequestConfig = {
    heartbeatInterval: 10 * second,
    timeout: 20 * second,
};

export async function createHttpEventStream<T extends FluxStandardAction<string, any>>(
    url: string,
    payload: T["payload"] = {},
    options?: EventStreamRequestConfig,
): Promise<Readable> {
    const requestOptions = {
        ...defaultRequestConfig,
        ...options,
    };

    const headers: OutgoingHttpHeaders = {
        "Accept": "application/x-ndjson",
        "x-heartbeat-interval": String(requestOptions.heartbeatInterval),
    };
    if (requestOptions.accessToken) {
        headers.Authorization = `Bearer: ${requestOptions.accessToken}`;
    }

    const search = querystring.stringify(payload);
    const requestStream = createRequestStream(
        "GET",
        new URL(url + (search ? `?${search}` : "")),
        headers,
        requestOptions.timeout!,
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
