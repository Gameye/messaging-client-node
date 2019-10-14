import { ReReadable } from "@gameye/streamkit";
import { OutgoingHttpHeaders } from "http";
import * as querystring from "querystring";
import { pipeline, Readable } from "stream";
import { EndStream, FromJSONTransform, SplitTransform } from "../streams";
import { createRequestStream, getResponse, retry } from "../utils";
import { defaultRequestConfig, RequestConfig, RequestRetryConfig } from "./request-config";

export function createHttpEventStreamRetry(
    url: string,
    payload: any = {},
    options?: RequestRetryConfig,
): Readable {
    return new ReReadable(
        () => retry(
            () => createHttpEventStream(
                url,
                payload,
                options ? options.requestOptions : undefined,
            ),
            options ? options.retryOptions : undefined,
            error => (error.statusCode && error.statusCode >= 500),
        ),
        { objectMode: true },
    );
}

export async function createHttpEventStream(
    url: string,
    payload: any = {},
    options?: RequestConfig,
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
