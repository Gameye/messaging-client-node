import * as test from "blue-tape";
import * as http from "http";
import * as Koa from "koa";
import * as querystring from "querystring";
import { ServerContext } from "server-context";
import { finished, PassThrough } from "stream";
import { promisify } from "util";
import { TestContext } from "../test";
import { delay } from "../utils";
import { createHttpEventStream, createHttpEventStreamRetry } from "./event-stream";

const whenFinished = promisify(finished);

test("http-event-stream", t => TestContext.with(async ctx => {
    ctx.pushHandler(async ({ request, response }) => {
        t.equal(request.method, "GET");
        t.equal(request.path, "/test");
        t.deepEqual(querystring.parse(request.querystring), { a: "1" });
        response.header["content-type"] = "application/x-ndjson";
        response.status = 200;
        const body = new PassThrough();
        response.body = body;

        const write = (chunk: any) => new Promise(
            (resolve, reject) => body.write(chunk, error => error ? reject(error) : resolve()),
        );
        const end = () => new Promise(
            resolve => body.end(resolve),
        );

        await write(JSON.stringify({ b: 3 }));
        await write("\n");
        await write(JSON.stringify({ c: 4 }));
        await write("\n");
        await end();
    });

    const stream = await createHttpEventStream(
        ctx.testEndpoint + "/test",
        { a: 1 },
    );
    const expectChunk = [
        { b: 3 },
        { c: 4 },
    ];
    stream.on("data", chunk => {
        t.deepEqual(chunk, expectChunk.shift());
    });

    await whenFinished(stream);

    t.equal(expectChunk.length, 0);
}));

test("http-event-stream not end", t => TestContext.with(async ctx => {
    ctx.pushHandler(dummyHandler(
        t,
        [{ b: 3 }, { c: 4 }],
        200,
        false,
    ));

    const stream = await createHttpEventStream(
        ctx.testEndpoint + "/test",
        { a: 1 },
    );
    const expectChunk = [
        { b: 3 },
        { c: 4 },
    ];
    stream.on("data", chunk => {
        t.deepEqual(chunk, expectChunk.shift());
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
    stream.destroy();
    await whenFinished(stream);

    t.equal(expectChunk.length, 0);
}));

test("http-event-stream error", t => TestContext.with(async ctx => {
    ctx.pushHandler(dummyHandler(
        t,
        [{ b: 3 }, { c: 4 }],
        400,
        false,
    ));

    try {
        const stream = await createHttpEventStream(
            ctx.testEndpoint + "/test",
            { a: 1 },
        );
        t.fail();
    }
    catch (err) {
        t.pass();
    }
}));

test("http-event-stream", t => TestContext.with(async ctx => {
    ctx.pushHandler(dummyHandler(
        t,
        [{ b: 3 }, { c: 4 }],
        200,
        true,
    ));

    const stream = await createHttpEventStream(
        ctx.testEndpoint + "/test",
        { a: 1 },
    );
    const expectChunk = [
        { b: 3 },
        { c: 4 },
    ];
    stream.on("data", chunk => {
        t.deepEqual(chunk, expectChunk.shift());
    });

    await whenFinished(stream);

    t.equal(expectChunk.length, 0);
}));

test("http-event-stream error", t => TestContext.with(async ctx => {
    const testServer = http.createServer((req, res) => {
        res.flushHeaders();
        let iteration = 0;
        const handle = setInterval(() => {
            res.write(JSON.stringify({ i: iteration++ }));
            res.write("\n");
        }, 1000);
        res.on("close", () => clearInterval(handle));
    });

    const serverContext = new ServerContext(testServer, { port: 9010 });
    const streamPromise = createHttpEventStream(
        "http://localhost:9010",
        {},
    );

    await serverContext.start();
    await delay(2 * 1000);

    await streamPromise;

    await delay(2 * 1000);
    await serverContext.stop();
}));

function dummyHandler(
    t: test.Test,
    data: any[],
    status: number,
    doEnd: boolean,
) {
    return async ({ request, response }: Koa.Context) => {
        t.equal(request.method, "GET");
        t.equal(request.path, "/test");
        t.deepEqual(querystring.parse(request.querystring), { a: "1" });
        response.header["content-type"] = "application/x-ndjson";
        response.status = status;
        const body = new PassThrough();
        response.body = body;
        const write = (chunk: any) => new Promise(
            (resolve, reject) => body.write(chunk, error => error ? reject(error) : resolve()),
        );
        const end = () => new Promise(
            resolve => body.end(resolve),
        );

        for (const chunk of data) {
            await write(JSON.stringify(chunk));
            await write("\n");
        }
        if (doEnd) await end();
    };
}

test("http-event-stream-retry 4xx", t => TestContext.with(async ctx => {
    let requestCounter = 0;

    ctx.pushHandler(({ _, response }: Koa.Context) => {
        requestCounter++;
        response.header["content-type"] = "application/x-ndjson";
        response.status = 400;
        response.message = "Bad Request";
    });

    const stream = createHttpEventStreamRetry(ctx.testEndpoint);
    stream.resume();
    await new Promise(resolve => stream.on("error", (err: Error) => {
        t.equal(err.message, "Bad Request", "Got bad request");
        resolve();
    }));

    t.equal(requestCounter, 1, `Requested ${requestCounter} times`);
}));

test("http-event-stream-retry 5xx", t => TestContext.with(async ctx => {
    const requestCount = 5;
    let requestCounter = 0;

    for (let i = 0; i < requestCount; i++) {
        // tslint:disable-next-line: no-identical-functions
        ctx.pushHandler(({ _, response }: Koa.Context) => {
            requestCounter++;
            response.header["content-type"] = "application/x-ndjson";
            response.status = 500;
            response.message = "Internal Server Error";
        });
    }

    // Retry one time less than the total number of requests
    const stream = createHttpEventStreamRetry(ctx.testEndpoint, null, { retryLimit: requestCount - 1 });
    stream.resume();
    await new Promise(resolve => stream.on("error", (err: Error) => {
        t.equal(err.message, "Internal Server Error", "Got Internal Server Error");
        resolve();
    }));

    t.equal(requestCounter, requestCount, `Requested ${requestCounter} times`);
}));

test("http-event-stream-retry 5xx4xx", t => TestContext.with(async (ctx) => {
    const requestCount = 6;
    let requestCounter = 0;

    for (let i = 0; i < requestCount - 1; i++) {
        ctx.pushHandler(({ response }: Koa.Context) => {
            requestCounter++;
            response.header["content-type"] = "application/x-ndjson";
            response.status = 500;
        });
    }

    // tslint:disable-next-line: no-identical-functions
    ctx.pushHandler(({ response }: Koa.Context) => {
        requestCounter++;
        response.header["content-type"] = "application/x-ndjson";
        response.status = 400;
    });

    const stream = createHttpEventStreamRetry(ctx.testEndpoint);
    stream.resume();
    await new Promise(resolve => stream.on("error", (err: Error) => {
        t.equal(err.message, "Bad Request", `Got ${err.message}`);
        resolve();
    }));

    t.equal(requestCounter, requestCount, `Requested ${requestCounter} times`);
}));

test("http-event-stream-retry 5xx2xx", t => TestContext.with(async (ctx) => {
    const requestCount = 3;
    let requestCounter = 0;

    for (let i = 0; i < requestCount - 1; i++) {
        // tslint:disable-next-line: no-identical-functions
        ctx.pushHandler(({ response }: Koa.Context) => {
            requestCounter++;
            response.header["content-type"] = "application/x-ndjson";
            response.status = 500;
        });
    }
    const data = { a: 1 };

    ctx.pushHandler(async ({ response }: Koa.Context) => {
        requestCounter++;
        response.header["content-type"] = "application/x-ndjson";
        response.status = 200;
        const body = new PassThrough();
        response.body = body;

        const write = (chunk: any) => new Promise(
            (resolve, reject) => body.write(chunk, error => error ? reject(error) : resolve()),
        );
        const end = () => new Promise(
            resolve => body.end(resolve),
        );

        await write(JSON.stringify(data));
        await write("\n");
        await end();
    });

    const stream = createHttpEventStreamRetry(ctx.testEndpoint);
    stream.on("error", () => {
        t.fail("No errors should occur");
    });
    await new Promise(resolve => stream.on("data", chunk => {
        t.deepEqual(chunk, data);
        stream.destroy();
        resolve();
    }));

    t.equal(requestCounter, requestCount, `Requested ${requestCounter} times`);
}));
