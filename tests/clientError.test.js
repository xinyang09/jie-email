import test from "node:test";
import assert from "node:assert/strict";

const loadClientErrorModule = async () =>
  import("../public/clientError.js").catch(() => ({}));

test("formats fetch failures as a local service hint", async () => {
  const clientErrorModule = await loadClientErrorModule();

  const message = clientErrorModule.formatLookupError?.({
    error: new TypeError("fetch failed")
  });

  assert.equal(
    message,
    "无法连接到本地服务，请确认 http://127.0.0.1:3000 正在运行。"
  );
});

test("keeps API error messages returned by the backend", async () => {
  const clientErrorModule = await loadClientErrorModule();

  const message = clientErrorModule.formatLookupError?.({
    payload: { error: "Temp Mail API authentication failed (401)." }
  });

  assert.equal(message, "Temp Mail API authentication failed (401).");
});

test("includes a similar address suggestion when available", async () => {
  const clientErrorModule = await loadClientErrorModule();

  const message = clientErrorModule.formatLookupError?.({
    payload: {
      error: "No message found for that address.",
      suggestion: "zxertq@jijie.online"
    }
  });

  assert.equal(
    message,
    "No message found for that address. Did you mean zxertq@jijie.online?"
  );
});
