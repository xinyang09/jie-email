import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAdminMailApiClient } from "./adminMailApi.js";
import { loadAppConfig, validateAppConfig } from "./config.js";
import { isValidEmailAddress, normalizeAddress } from "./emailMatcher.js";
import { createFileEmailWhitelistStore } from "./emailWhitelistStore.js";
import { createMailboxService } from "./mailboxService.js";
import { createFileOrderEmailStore, normalizeOrderId } from "./orderEmailStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

export const isExecutedAsEntryPoint = (
  importMetaUrl,
  argv1 = process.argv[1],
  cwd = process.cwd()
) => {
  if (!argv1) {
    return false;
  }

  return fileURLToPath(importMetaUrl) === path.resolve(cwd, argv1);
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
};

const sendFile = async (response, filePath, contentType) => {
  const fileContents = await readFile(filePath);

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(fileContents);
};

const notFound = (response) => {
  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end("Not found");
};

const readJsonBody = async (request) => {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
  }

  if (!body.trim()) {
    return {};
  }

  return JSON.parse(body);
};

const getRequestHeader = (request, name) => {
  const headers = request.headers ?? {};
  const directValue = headers[name] ?? headers[name.toLowerCase()];

  return Array.isArray(directValue) ? directValue[0] : directValue;
};

const isAuthorized = (request, url, authCode) => {
  const expectedCode = String(authCode ?? "");
  const headerCode =
    getRequestHeader(request, "x-auth-code") ||
    getRequestHeader(request, "x-whitelist-auth");
  const authorization = String(getRequestHeader(request, "authorization") ?? "");
  const bearerCode = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const queryCode = url.searchParams.get("code");

  return [headerCode, bearerCode, queryCode].some((value) => value === expectedCode);
};

const isWhitelistedAddress = async ({ address, whitelistStore }) => {
  const addresses = await whitelistStore.list();

  return addresses.includes(address);
};

const createDefaultMailboxService = () => ({
  async getLatestMessage() {
    throw new Error("Mailbox service is not configured.");
  }
});

const createDefaultWhitelistStore = () => ({
  async list() {
    return [];
  },
  async add() {
    throw new Error("Email whitelist store is not configured.");
  },
  async delete() {
    throw new Error("Email whitelist store is not configured.");
  }
});

const createDefaultOrderEmailStore = () => ({
  async list() {
    return {};
  },
  async get() {
    return [];
  },
  async set() {
    throw new Error("Order email store is not configured.");
  },
  async delete() {
    throw new Error("Order email store is not configured.");
  }
});

export const createRequestHandler = ({
  mailboxService = createDefaultMailboxService(),
  whitelistStore = createDefaultWhitelistStore(),
  orderEmailStore = createDefaultOrderEmailStore(),
  whitelistAuthCode = "Xinyang666!",
  staticDirectory = publicDir
} = {}) => async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const isHeadRequest = request.method === "HEAD";
    const isReadRequest = request.method === "GET" || isHeadRequest;

    if (url.pathname === "/api/email-whitelist") {
      if (!isAuthorized(request, url, whitelistAuthCode)) {
        sendJson(response, 401, { error: "Unauthorized." });
        return;
      }

      if (request.method === "GET") {
        sendJson(response, 200, { addresses: await whitelistStore.list() });
        return;
      }

      if (request.method === "POST") {
        const payload = await readJsonBody(request);
        const action = String(payload.action ?? "").trim().toLowerCase();
        const address = normalizeAddress(payload.address);

        if (!isValidEmailAddress(address)) {
          sendJson(response, 400, {
            error: "Please provide a valid email address."
          });
          return;
        }

        if (action === "add") {
          sendJson(response, 200, {
            addresses: await whitelistStore.add(address)
          });
          return;
        }

        if (action === "delete" || action === "remove") {
          sendJson(response, 200, {
            addresses: await whitelistStore.delete(address)
          });
          return;
        }

        sendJson(response, 400, {
          error: "Unsupported action. Use add or delete."
        });
        return;
      }

      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    if (url.pathname === "/api/order-email-map") {
      if (!isAuthorized(request, url, whitelistAuthCode)) {
        sendJson(response, 401, { error: "Unauthorized." });
        return;
      }

      if (request.method === "GET") {
        const orderId = normalizeOrderId(url.searchParams.get("orderId"));

        sendJson(
          response,
          200,
          orderId
            ? { orderId, addresses: await orderEmailStore.get(orderId) }
            : { orders: await orderEmailStore.list() }
        );
        return;
      }

      if (request.method === "POST") {
        const payload = await readJsonBody(request);
        const action = String(payload.action ?? "set").trim().toLowerCase();
        const orderId = normalizeOrderId(payload.orderId);

        if (!orderId) {
          sendJson(response, 400, { error: "Please provide an order id." });
          return;
        }

        if (action === "set" || action === "add") {
          const addresses = Array.isArray(payload.addresses)
            ? payload.addresses
            : [payload.address];

          try {
            sendJson(response, 200, {
              orderId,
              addresses: await orderEmailStore.set(orderId, addresses)
            });
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : "Invalid order email mapping."
            });
          }
          return;
        }

        if (action === "delete" || action === "remove") {
          sendJson(response, 200, {
            orderId,
            addresses: await orderEmailStore.delete(orderId)
          });
          return;
        }

        sendJson(response, 400, {
          error: "Unsupported action. Use set or delete."
        });
        return;
      }

      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/order-messages") {
      const orderId = normalizeOrderId(url.searchParams.get("orderId"));

      if (!orderId) {
        sendJson(response, 400, { error: "Please provide an order id." });
        return;
      }

      const addresses = await orderEmailStore.get(orderId);

      if (!addresses.length) {
        sendJson(response, 404, { error: "No email addresses found for that order." });
        return;
      }

      const messageGroups = await Promise.all(
        addresses.map(async (address) => ({
          address,
          messages:
            typeof mailboxService.listMessages === "function"
              ? await mailboxService.listMessages(address)
              : []
        }))
      );
      const messages = messageGroups
        .flatMap((group) =>
          group.messages.map((message) => ({
            ...message,
            matchedAddress: message.matchedAddress || group.address
          }))
        )
        .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime());

      sendJson(response, 200, { orderId, addresses, messages });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/messages") {
      const address = normalizeAddress(url.searchParams.get("address"));

      if (!isValidEmailAddress(address)) {
        sendJson(response, 400, {
          error: "Please provide a valid email address."
        });
        return;
      }

      if (
        !(await isWhitelistedAddress({
          address,
          whitelistStore
        }))
      ) {
        sendJson(response, 403, { error: "Email address is not allowed." });
        return;
      }

      const messages =
        typeof mailboxService.listMessages === "function"
          ? await mailboxService.listMessages(address)
          : [];

      sendJson(response, 200, { messages });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/messages/latest") {
      const address = normalizeAddress(url.searchParams.get("address"));

      if (!isValidEmailAddress(address)) {
        sendJson(response, 400, {
          error: "Please provide a valid email address."
        });
        return;
      }

      if (
        !(await isWhitelistedAddress({
          address,
          whitelistStore
        }))
      ) {
        sendJson(response, 403, { error: "Email address is not allowed." });
        return;
      }

      const latestMessage = await mailboxService.getLatestMessage(address);

      if (!latestMessage) {
        const suggestion =
          typeof mailboxService.suggestAddress === "function"
            ? await mailboxService.suggestAddress(address)
            : null;

        sendJson(response, 404, {
          error: "No message found for that address.",
          suggestion
        });
        return;
      }

      sendJson(response, 200, { message: latestMessage });
      return;
    }

    if (isReadRequest && url.pathname === "/") {
      if (isHeadRequest) {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        });
        response.end();
        return;
      }

      await sendFile(response, path.join(staticDirectory, "index.html"), "text/html; charset=utf-8");
      return;
    }

    if (isReadRequest && url.pathname === "/app.js") {
      if (isHeadRequest) {
        response.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        });
        response.end();
        return;
      }

      await sendFile(
        response,
        path.join(staticDirectory, "app.js"),
        "application/javascript; charset=utf-8"
      );
      return;
    }

    if (isReadRequest && url.pathname === "/clientError.js") {
      if (isHeadRequest) {
        response.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        });
        response.end();
        return;
      }

      await sendFile(
        response,
        path.join(staticDirectory, "clientError.js"),
        "application/javascript; charset=utf-8"
      );
      return;
    }

    if (isReadRequest && url.pathname === "/styles.css") {
      if (isHeadRequest) {
        response.writeHead(200, {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-store"
        });
        response.end();
        return;
      }

      await sendFile(response, path.join(staticDirectory, "styles.css"), "text/css; charset=utf-8");
      return;
    }

    notFound(response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
};

export const createServer = (options = {}) =>
  http.createServer(createRequestHandler(options));

export const createLiveMailboxService = (config) => {
  const adminMailApiClient = createAdminMailApiClient({
    baseUrl: config.tempMailBaseUrl,
    adminAuth: config.tempMailAdminAuth,
    siteAuth: config.tempMailSiteAuth
  });

  return createMailboxService({
    listRecentMessages: (address) => adminMailApiClient.listMailsByAddress(address)
  });
};

if (isExecutedAsEntryPoint(import.meta.url)) {
  try {
    const config = loadAppConfig();

    validateAppConfig(config);

    const server = createServer({
      mailboxService: createLiveMailboxService(config),
      whitelistStore: createFileEmailWhitelistStore({
        filePath: path.resolve(process.cwd(), config.whitelistFilePath)
      }),
      orderEmailStore: createFileOrderEmailStore({
        filePath: path.resolve(process.cwd(), config.orderEmailFilePath)
      }),
      whitelistAuthCode: config.whitelistAuthCode
    });

    server.listen(config.port, config.host, () => {
      process.stdout.write(`Server listening on http://${config.host}:${config.port}\n`);
    });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Failed to start server."}\n`
    );
    process.exitCode = 1;
  }
}
