import * as test from "tape-promise/tape";
import { HttpError } from "http-errors";
import { TestContext } from "../test";
import { invokeHttpCommand } from "./command";

test("http-command", t => TestContext.with(async ctx => {
    ctx.pushHandler(({ request, response }) => {
        t.equal(request.method, "POST");
        t.equal(request.url, "/test");
        t.equal(request.headers["content-type"], "application/json");
        t.deepEqual(request.body, { a: 1 });
        response.status = 202;
    });

    await invokeHttpCommand(ctx.testEndpoint + "/test", { a: 1 });
}));

test("http-command unexpected result", t => TestContext.with(async ctx => {
    ctx.pushHandler(({ request, response }) => {
        response.status = 400;
    });

    try {
        await invokeHttpCommand(ctx.testEndpoint + "/test", { a: 1 });
        t.fail("should throw");
    }
    catch (error) {
        if (error instanceof HttpError) {
            t.equal(error.statusCode, 400);
            error = null;
        }

        if (error) throw error;
    }
}));

test("http-command non existing endpoint", t => TestContext.with(async ctx => {
    try {
        await invokeHttpCommand("http://exists.not", { a: 1 });
        t.fail("should throw");
    }
    catch (error) {
        t.pass("error thrown!");
    }
}));
