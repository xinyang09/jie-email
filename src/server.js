import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAdminMailApiClient } from "./adminMailApi.js";
import { loadAppConfig, validateAppConfig } from "./config.js";
import { isValidEmailAddress, normalizeAddress } from "./emailMatcher.js";
import { createMailboxService } from "./mailboxService.js";

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

const createDefaultMailboxService = () => ({
  async getLatestMessage() {
    throw new Error("Mailbox service is not configured.");
  }
});

export const createRequestHandler = ({
  mailboxService = createDefaultMailboxService(),
  staticDirectory = publicDir
} = {}) => async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const isHeadRequest = request.method === "HEAD";
    const isReadRequest = request.method === "GET" || isHeadRequest;

    if (request.method === "GET" && url.pathname === "/api/messages") {
      const address = normalizeAddress(url.searchParams.get("address"));

      if (!isValidEmailAddress(address)) {
        sendJson(response, 400, {
          error: "Please provide a valid email address."
        });
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
      mailboxService: createLiveMailboxService(config)
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
