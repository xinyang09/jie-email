import test from "node:test";
import assert from "node:assert/strict";

const loadServerModule = async () => import("../src/server.js").catch(() => ({}));

const createJsonRequest = ({ method = "GET", url, headers = {}, body = "" }) => ({
  method,
  url,
  headers,
  async *[Symbol.asyncIterator]() {
    if (body) {
      yield Buffer.from(body, "utf8");
    }
  }
});

const callHandler = async (messageForAddress, url, options = {}) => {
  const serverModule = await loadServerModule();
  const whitelistedAddresses = options.whitelistedAddresses ?? Object.keys(messageForAddress);
  const orderRecords = options.orderRecords ?? {};
  const handler = serverModule.createRequestHandler?.({
    whitelistAuthCode: "Xinyang666!",
    whitelistStore: {
      list: async () => whitelistedAddresses
    },
    orderEmailStore: {
      list: async () => orderRecords,
      get: async (orderId) => orderRecords[orderId] ?? [],
      set: async () => [],
      delete: async () => []
    },
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
    execute: async (method = "GET", requestHeaders = {}) => {
      await handler?.(
        {
          method,
          url,
          headers: requestHeaders
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

const callWhitelistHandler = async ({
  method = "GET",
  url = "/api/email-whitelist",
  headers = {},
  body = "",
  addresses = []
} = {}) => {
  const serverModule = await loadServerModule();
  const storedAddresses = [...addresses];
  const handler = serverModule.createRequestHandler?.({
    whitelistAuthCode: "Xinyang666!",
    whitelistStore: {
      list: async () => [...storedAddresses],
      add: async (address) => {
        if (!storedAddresses.includes(address)) {
          storedAddresses.push(address);
        }

        return [...storedAddresses];
      },
      delete: async (address) => {
        const index = storedAddresses.indexOf(address);

        if (index >= 0) {
          storedAddresses.splice(index, 1);
        }

        return [...storedAddresses];
      }
    }
  });

  let statusCode = 200;
  let responseHeaders = {};
  let responseBody = "";

  await handler?.(
    createJsonRequest({
      method,
      url,
      headers,
      body
    }),
    {
      writeHead(code, nextHeaders) {
        statusCode = code;
        responseHeaders = nextHeaders;
      },
      end(chunk = "") {
        responseBody = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
    }
  );

  return {
    statusCode,
    headers: responseHeaders,
    body:
      responseHeaders["Content-Type"]?.includes("application/json") && responseBody
        ? JSON.parse(responseBody)
        : responseBody
  };
};

const callOrderHandler = async ({
  method = "GET",
  url = "/api/order-email-map",
  headers = {},
  body = "",
  orders = {}
} = {}) => {
  const serverModule = await loadServerModule();
  const storedOrders = { ...orders };
  const handler = serverModule.createRequestHandler?.({
    whitelistAuthCode: "Xinyang666!",
    orderEmailStore: {
      list: async () => ({ ...storedOrders }),
      get: async (orderId) => storedOrders[orderId] ?? [],
      set: async (orderId, addresses) => {
        storedOrders[orderId] = addresses;

        return storedOrders[orderId];
      },
      delete: async (orderId) => {
        delete storedOrders[orderId];

        return [];
      }
    }
  });

  let statusCode = 200;
  let responseHeaders = {};
  let responseBody = "";

  await handler?.(
    createJsonRequest({
      method,
      url,
      headers,
      body
    }),
    {
      writeHead(code, nextHeaders) {
        statusCode = code;
        responseHeaders = nextHeaders;
      },
      end(chunk = "") {
        responseBody = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
    }
  );

  return {
    statusCode,
    headers: responseHeaders,
    body:
      responseHeaders["Content-Type"]?.includes("application/json") && responseBody
        ? JSON.parse(responseBody)
        : responseBody
  };
};

test("GET /api/messages/latest returns 400 for an invalid address", async () => {
  const app = await callHandler({}, "/api/messages/latest?address=not-an-email");
  const response = await app.execute();

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "Please provide a valid email address.");
});

test("GET /api/email-whitelist requires authentication", async () => {
  const response = await callWhitelistHandler();

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "Unauthorized.");
});

test("GET /api/email-whitelist returns addresses with auth code", async () => {
  const response = await callWhitelistHandler({
    headers: {
      "x-auth-code": "Xinyang666!"
    },
    addresses: ["first@demo.example", "second@demo.example"]
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.addresses, [
    "first@demo.example",
    "second@demo.example"
  ]);
});

test("POST /api/email-whitelist adds an address", async () => {
  const response = await callWhitelistHandler({
    method: "POST",
    headers: {
      authorization: "Bearer Xinyang666!"
    },
    body: JSON.stringify({
      action: "add",
      address: "New@Demo.Example"
    })
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.addresses, ["new@demo.example"]);
});

test("POST /api/email-whitelist deletes an address", async () => {
  const response = await callWhitelistHandler({
    method: "POST",
    headers: {
      "x-auth-code": "Xinyang666!"
    },
    addresses: ["delete@demo.example", "keep@demo.example"],
    body: JSON.stringify({
      action: "delete",
      address: "delete@demo.example"
    })
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.addresses, ["keep@demo.example"]);
});

test("POST /api/email-whitelist rejects unsupported actions", async () => {
  const response = await callWhitelistHandler({
    method: "POST",
    headers: {
      "x-auth-code": "Xinyang666!"
    },
    body: JSON.stringify({
      action: "clear",
      address: "clear@demo.example"
    })
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "Unsupported action. Use add or delete.");
});

test("GET /api/messages blocks direct access for non-whitelisted addresses", async () => {
  const app = await callHandler(
    {
      "blocked@demo.example": [
        {
          matchedAddress: "blocked@demo.example",
          subject: "Blocked",
          from: "noreply@service.test",
          sentAt: "2026-05-03T12:00:00.000Z",
          text: "123456"
        }
      ]
    },
    "/api/messages?address=blocked@demo.example",
    {
      whitelistedAddresses: []
    }
  );

  const response = await app.execute();

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, "Email address is not allowed.");
});

test("GET /api/messages still blocks admin code for non-whitelisted addresses", async () => {
  const app = await callHandler(
    {
      "blocked@demo.example": [
        {
          matchedAddress: "blocked@demo.example",
          subject: "Blocked",
          from: "noreply@service.test",
          sentAt: "2026-05-03T12:00:00.000Z",
          text: "123456"
        }
      ]
    },
    "/api/messages?address=blocked@demo.example",
    {
      whitelistedAddresses: []
    }
  );

  const response = await app.execute("GET", {
    "x-auth-code": "Xinyang666!"
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, "Email address is not allowed.");
});

test("POST /api/order-email-map stores order email mapping", async () => {
  const response = await callOrderHandler({
    method: "POST",
    headers: {
      "x-auth-code": "Xinyang666!"
    },
    body: JSON.stringify({
      action: "set",
      orderId: "ORDER-1001",
      addresses: ["first@demo.example", "second@demo.example"]
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.orderId, "ORDER-1001");
  assert.deepEqual(response.body.addresses, [
    "first@demo.example",
    "second@demo.example"
  ]);
});

test("GET /api/order-email-map returns one order mapping", async () => {
  const response = await callOrderHandler({
    url: "/api/order-email-map?orderId=ORDER-1001",
    headers: {
      "x-auth-code": "Xinyang666!"
    },
    orders: {
      "ORDER-1001": ["first@demo.example"]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    orderId: "ORDER-1001",
    addresses: ["first@demo.example"]
  });
});

test("GET /api/order-messages returns messages for every mapped address", async () => {
  const app = await callHandler(
    {
      "first@demo.example": [
        {
          matchedAddress: "first@demo.example",
          subject: "First",
          from: "noreply@service.test",
          sentAt: "2026-05-03T12:00:00.000Z",
          text: "111111"
        }
      ],
      "second@demo.example": [
        {
          matchedAddress: "second@demo.example",
          subject: "Second",
          from: "noreply@service.test",
          sentAt: "2026-05-03T12:01:00.000Z",
          text: "222222"
        }
      ]
    },
    "/api/order-messages?orderId=ORDER-1001",
    {
      orderRecords: {
        "ORDER-1001": ["first@demo.example", "second@demo.example"]
      }
    }
  );

  const response = await app.execute();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.addresses, [
    "first@demo.example",
    "second@demo.example"
  ]);
  assert.deepEqual(
    response.body.messages.map((message) => message.subject),
    ["Second", "First"]
  );
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
    "/api/messages/latest?address=missing@demo.example",
    {
      whitelistedAddresses: ["missing@demo.example"]
    }
  );

  const response = await app.execute();

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "No message found for that address.");
});

test("GET /api/messages/latest returns a suggestion for a similar address", async () => {
  const serverModule = await loadServerModule();
  const handler = serverModule.createRequestHandler?.({
    whitelistStore: {
      list: async () => ["zxertq@jjie.online"]
    },
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
