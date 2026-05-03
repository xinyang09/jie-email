import test from "node:test";
import assert from "node:assert/strict";

const loadAdminMailApiModule = async () =>
  import("../src/adminMailApi.js").catch(() => ({}));

test("requests the admin mail API with address filter and auth headers", async () => {
  const adminMailApiModule = await loadAdminMailApiModule();
  let requestedUrl = "";
  let requestedHeaders = {};

  const client = adminMailApiModule.createAdminMailApiClient?.({
    baseUrl: "https://temp-mail.example",
    adminAuth: "super-secret",
    siteAuth: "site-password",
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedHeaders = options.headers;

      return {
        ok: true,
        async json() {
          return [{ id: 1, address: "alias@demo.example", raw: "Subject: hi\r\n\r\nbody" }];
        }
      };
    }
  });

  const records = await client?.listMailsByAddress("alias@demo.example");

  assert.equal(
    requestedUrl,
    "https://temp-mail.example/admin/mails?limit=20&offset=0&address=alias%40demo.example"
  );
  assert.equal(requestedHeaders["x-admin-auth"], "super-secret");
  assert.equal(requestedHeaders["x-custom-auth"], "site-password");
  assert.equal(records?.[0]?.address, "alias@demo.example");
});

test("supports object responses with nested mail arrays", async () => {
  const adminMailApiModule = await loadAdminMailApiModule();

  const client = adminMailApiModule.createAdminMailApiClient?.({
    baseUrl: "https://temp-mail.example",
    adminAuth: "super-secret",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          data: [
            { id: 2, address: "alias@demo.example", source: "Subject: hi\r\n\r\nbody" }
          ]
        };
      }
    })
  });

  const records = await client?.listMailsByAddress("alias@demo.example");

  assert.equal(records?.length, 1);
  assert.equal(records?.[0]?.source, "Subject: hi\r\n\r\nbody");
});

test("returns a credential hint for 401 responses", async () => {
  const adminMailApiModule = await loadAdminMailApiModule();

  const client = adminMailApiModule.createAdminMailApiClient?.({
    baseUrl: "https://temp-mail.example",
    adminAuth: "wrong-secret",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async json() {
        return {};
      },
      async text() {
        return "";
      }
    })
  });

  await assert.rejects(
    () => client?.listMailsByAddress("alias@demo.example"),
    /Check TEMP_MAIL_ADMIN_AUTH and TEMP_MAIL_SITE_AUTH/
  );
});

test("can list recent mails without an address filter", async () => {
  const adminMailApiModule = await loadAdminMailApiModule();
  let requestedUrl = "";

  const client = adminMailApiModule.createAdminMailApiClient?.({
    baseUrl: "https://temp-mail.example",
    adminAuth: "super-secret",
    fetchImpl: async (url) => {
      requestedUrl = String(url);

      return {
        ok: true,
        async json() {
          return { results: [] };
        }
      };
    }
  });

  await client?.listMailsByAddress(undefined, { limit: 10, offset: 5 });

  assert.equal(
    requestedUrl,
    "https://temp-mail.example/admin/mails?limit=10&offset=5"
  );
});
