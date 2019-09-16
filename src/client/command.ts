import { second } from "msecs";
import { createRequestStream, getResponse, readResponse, writeAll } from "../utils";

export async function invokeHttpCommand(
    url: string,
    payload: any = {},
) {
    const urlObj = new URL(url);

    const requestStream = createRequestStream(
        "POST",
        urlObj,
        {
            "Content-type": "application/json",
        },
        10 * second,
    );

    await writeAll(requestStream, JSON.stringify(payload));

    try {
        const responseStream = await getResponse(requestStream);
        try {
            const result = await readResponse(responseStream);
            return result;
        }
        finally {
            responseStream.destroy();
        }
    }
    finally {
        requestStream.abort();
        requestStream.destroy();
    }
}
