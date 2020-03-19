// tslint:disable: no-identical-functions

import * as test from "blue-tape";
import { finished, PassThrough, Readable } from "stream";
import { promisify } from "util";
import { ReReadable } from "./rereadable";

const whenFinished = promisify(finished);
const noStreamError = new Error("no stream");
const streamWait = (stream: Readable) => new Promise(
    (resolve, reject) => stream.
        once("data", resolve).
        once("error", reject),
);

test("rereadable happy flow", async t => {
    let currentStream: PassThrough | undefined;
    const streams = [
        new PassThrough({ objectMode: true }),
        new PassThrough({ objectMode: true }),
    ];

    streams[0].write("a");
    streams[1].write("b");

    const wrapper = new ReReadable(async () => {
        const stream = currentStream = streams.shift();
        if (!stream) throw noStreamError;
        return stream;
    }, { objectMode: true });

    {
        const data = await streamWait(wrapper);
        t.equal(data, "a");
    }

    currentStream!.end();
    currentStream!.destroy();

    {
        const data = await streamWait(wrapper);
        t.equal(data, "b");
    }

    currentStream!.end();
    currentStream!.destroy();

    wrapper.destroy();
    whenFinished(wrapper);
});

test("rereadable unhappy flow", async t => {
    let currentStream: PassThrough | undefined;
    const streams = [
        new PassThrough({ objectMode: true }),
        new PassThrough({ objectMode: true }),
    ];

    streams[0].write("a");
    streams[1].write("b");

    const wrapper = new ReReadable(async () => {
        const stream = currentStream = streams.shift();
        if (!stream) throw noStreamError;
        return stream;
    }, { objectMode: true });

    {
        const data = await streamWait(wrapper);
        t.equal(data, "a");
    }

    currentStream!.end();
    currentStream!.destroy();

    {
        const data = await streamWait(wrapper);
        t.equal(data, "b");
    }

    currentStream!.end();
    currentStream!.destroy();

    try {
        await streamWait(wrapper);

        t.fail();
    }
    catch (error) {
        t.equal(error, noStreamError);
    }

    wrapper.destroy();
    whenFinished(wrapper);
});
