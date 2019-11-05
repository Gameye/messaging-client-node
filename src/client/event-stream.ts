import { FluxStandardAction } from "flux-standard-action";
import { OutgoingHttpHeaders } from "http";
import { HttpError } from "http-errors";
import { second } from "msecs";
import { cancellable, retry, RetryConfig } from "promise-u";
import * as querystring from "querystring";
import { pipeline, Readable } from "stream";
import { ErrorAction, HttpErrorAction } from "../actions";
import { EndStream, FromJSONTransform, ReReadable, SplitTransform } from "../streams";
import { createRequestStream, getResponse } from "../utils";

export type EventStreamRequestRetryConfig = EventStreamRequestConfig & RetryConfig;

/**
 * create event-stream that will retry forever on http server (>= 500) or
 * network errors
 */
// tslint:disable-next-line: cognitive-complexity
export function createHttpEventStreamRetry<T extends FluxStandardAction<string, any>>(
    url: string,
    payload: T["payload"] = {},
    options: EventStreamRequestRetryConfig = {},
): Readable {
    const sink = new EndStream({ objectMode: true });
    const writeError = (error: any) => {
        if (error instanceof HttpError) {
            const {
                name,
                message,
                status,
            } = error;
            sink.write({
                type: "http-error",
                error: true,
                payload: {
                    name,
                    message,
                    status,
                },
            } as HttpErrorAction);

            return;
        }

        if (error instanceof Error) {
            const {
                name,
                message,
                code,
            } = error as any;
            sink.write({
                type: "error",
                error: true,
                payload: {
                    name,
                    message,
                    code,
                },
            } as ErrorAction);

            return;
        }
    };

    const cancellation = cancellable();
    const stream = new ReReadable(
        () => retry(
            async () => createHttpEventStream(
                url,
                payload,
                options,
            ),
            options,
            error => {
                writeError(error);

                if (
                    error instanceof HttpError &&
                    error.statusCode < 500
                ) {
                    // do not retry for http errors with status < 500
                    throw error;
                }
            },
            cancellation.promise,
        ),
        { objectMode: true },
    );

    pipeline(
        stream,
        sink,
        error => {
            cancellation.cancel();
            sink.destroy(error || undefined);
        },
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
    options: EventStreamRequestConfig = {},
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
