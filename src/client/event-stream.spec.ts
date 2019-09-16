import * as test from "blue-tape";
import * as http from "http";
import * as Koa from "koa";
import * as querystring from "querystring";
import { ServerContext } from "server-context";
import { finished, PassThrough } from "stream";
import { promisify } from "util";
import { TestContext } from "../test";
import { delay } from "../utils";
import { createHttpEventStream } from "./event-stream";

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
