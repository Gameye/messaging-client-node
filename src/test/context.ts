import * as http from "http";
import * as Koa from "koa";
import * as bodyParser from "koa-bodyparser";
import * as net from "net";

export class TestContext {

    public static async with<T>(job: (context: TestContext) => PromiseLike<T> | T): Promise<T> {
        const context = new this();
        try {
            await context.setup();
            return await job(context);
        }
        finally {
            await context.teardown();
        }
    }

    public readonly testServer = http.createServer(this.getTestHandler());
    public readonly testEndpoint = "http://localhost:8001";

    private readonly socketSet = new Set<net.Socket>();

    private readonly handlers = new Array<((ctx: Koa.Context) => PromiseLike<void> | void)>();

    public pushHandler(handler: ((ctx: Koa.Context) => PromiseLike<void> | void)) {
        this.handlers.push(handler);
        return handler;
    }

    //#region initialize

    private getTestHandler() {
        const koaServer = new Koa();

        koaServer.use(bodyParser());
        koaServer.use(async ctx => {
            const handler = this.handlers.shift();
            if (handler) await handler(ctx);
        });

        return koaServer.callback();
    }

    //#endregion

    //#region setup / teardown

    private async setup() {
        const { testServer } = this;
        testServer.on("connection", this.onConnection);
        await new Promise(resolve => testServer.listen(8001, resolve));
    }

    private async teardown() {
        const { testServer } = this;
        this.socketSet.forEach(socket => socket.destroy());
        await new Promise(resolve => testServer.close(resolve));
        if (this.handlers.length > 0) throw new Error("some handlers not called");
    }

    //#endregion

    private onConnection = (socket: net.Socket) => {
        this.socketSet.add(socket);
        socket.on("close", () => this.socketSet.delete(socket));
    }
}
