import { second } from "msecs";
import * as querystring from "querystring";
import { pipeline, Readable } from "stream";
import { EndStream, FromJSONTransform, SplitTransform } from "../streams";
import { createRequestStream, getResponse } from "../utils";

export async function createHttpEventStream(
    url: string,
    payload: any = {},
): Promise<Readable> {
    const heartbeatInterval = 10 * second;
    const search = querystring.stringify(payload);
    const requestStream = createRequestStream(
        "GET",
        new URL(url + (search ? `?${search}` : "")),
        {
            "Accept": "application/x-ndjson",
            "x-heartbeat-interval": String(heartbeatInterval),
        },
        10 * second,
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
