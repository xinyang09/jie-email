import test from "node:test";
import assert from "node:assert/strict";

const loadServerModule = async () => import("../src/server.js").catch(() => ({}));

const callHandler = async (messageForAddress, url) => {
  const serverModule = await loadServerModule();
  const handler = serverModule.createRequestHandler?.({
    mailboxService: {
      getLatestMessage: async (address) => messageForAddress[address] ?? null,
      listMessages: async (address) =>
        Array.isArray(messageForAddress[address])
          ? messageForAddress[address]
          : messageForAddress[address]
            ? [messageForAddress[address]]
            : [],
      suggestAddress: async () => null
    }
  });

  let statusCode = 200;
  let headers = {};
  let body = "";

  const response = {
    writeHead(code, nextHeaders) {
      statusCode = code;
      headers = nextHeaders;
    },
    end(chunk = "") {
      body = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    }
  };

  return {
    execute: async (method = "GET") => {
      await handler?.(
        {
          method,
          url
        },
        response
      );

      return {
        statusCode,
        headers,
        body:
          headers["Content-Type"]?.includes("application/json") && body
            ? JSON.parse(body)
            : body
      };
    }
  };
};

test("GET /api/messages/latest returns 400 for an invalid address", async () => {
  const app = await callHandler({}, "/api/messages/latest?address=not-an-email");
  const response = await app.execute();

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "Please provide a valid email address.");
});

test("GET /api/messages returns message list payload", async () => {
  const app = await callHandler(
    {
      "alias@demo.example": [
        {
          matchedAddress: "alias@demo.example",
          subject: "Newest code",
          from: "noreply@service.test",
          sentAt: "2026-05-03T12:00:00.000Z",
          text: "123456"
        }
      ]
    },
    "/api/messages?address=alias@demo.example"
  );

  const response = await app.execute();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.messages.length, 1);
  assert.equal(response.body.messages[0].subject, "Newest code");
});

test("GET /api/messages returns 400 for an invalid address", async () => {
  const app = await callHandler({}, "/api/messages?address=not-an-email");
  const response = await app.execute();

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "Please provide a valid email address.");
});

test("GET /api/messages/latest returns the latest message payload", async () => {
  const app = await callHandler(
    {
      "alias@demo.example": {
        matchedAddress: "alias@demo.example",
        subject: "Login code",
        from: "noreply@service.test",
        sentAt: "2026-05-03T12:00:00.000Z",
        text: "123456"
      }
    },
    "/api/messages/latest?address=alias@demo.example"
  );

  const response = await app.execute();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message.subject, "Login code");
  assert.equal(response.body.message.text, "123456");
});

test("GET /api/messages/latest returns 404 when no matching message exists", async () => {
  const app = await callHandler(
    {},
    "/api/messages/latest?address=missing@demo.example"
  );

  const response = await app.execute();

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "No message found for that address.");
});

test("GET /api/messages/latest returns a suggestion for a similar address", async () => {
  const serverModule = await loadServerModule();
  const handler = serverModule.createRequestHandler?.({
    mailboxService: {
      getLatestMessage: async () => null,
      suggestAddress: async () => "zxertq@jijie.online"
    }
  });

  let statusCode = 200;
  let headers = {};
  let body = "";

  await handler?.(
    {
      method: "GET",
      url: "/api/messages/latest?address=zxertq@jjie.online"
    },
    {
      writeHead(code, nextHeaders) {
        statusCode = code;
        headers = nextHeaders;
      },
      end(chunk = "") {
        body = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
    }
  );

  const payload = headers["Content-Type"]?.includes("application/json")
    ? JSON.parse(body)
    : body;

  assert.equal(statusCode, 404);
  assert.equal(payload.suggestion, "zxertq@jijie.online");
});

test("HEAD / returns 200 for uptime checks", async () => {
  const app = await callHandler({}, "/");
  const response = await app.execute("HEAD");

  assert.equal(response.statusCode, 200);
});

test("GET /clientError.js serves the browser helper module", async () => {
  const app = await callHandler({}, "/clientError.js");
  const response = await app.execute("GET");

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /formatLookupError/);
});

test("detects the current file as the entry point when argv uses a relative path", async () => {
  const serverModule = await loadServerModule();

  const result = serverModule.isExecutedAsEntryPoint?.(
    "file:///Users/xinyang/Documents/New%20project%203/src/server.js",
    "src/server.js",
    "/Users/xinyang/Documents/New project 3"
  );

  assert.equal(result, true);
});
