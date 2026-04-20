/**
 * Unit tests for src/commands.js — exercises every exported function and
 * every command handler by mocking fetch and @actions/core inputs.
 *
 * Run with: node --test test/commands.test.js
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { W3ActionError } from "@w3-io/action-core";
import {
  getApiUrl,
  buildHeaders,
  makeRequest,
  queryString,
  parseBody,
  setup,
  handler,
  createRouter,
  COMMANDS,
} from "../src/commands.js";

// ---------------------------------------------------------------------------
// Mock infrastructure: set env vars as @actions/core expects them
// ---------------------------------------------------------------------------

let originalFetch;
let fetchCalls;
const envKeysSet = new Set();

function setInputs(inputs) {
  for (const [key, value] of Object.entries(inputs)) {
    // @actions/core getInput replaces spaces with _, keeps hyphens
    const envKey = `INPUT_${key.replace(/ /g, "_").toUpperCase()}`;
    process.env[envKey] = value;
    envKeysSet.add(envKey);
  }
}

function clearInputs() {
  for (const key of envKeysSet) {
    delete process.env[key];
  }
  envKeysSet.clear();
}

beforeEach(() => {
  originalFetch = global.fetch;
  fetchCalls = [];
});

afterEach(() => {
  global.fetch = originalFetch;
  clearInputs();
});

function mockFetch(responses) {
  let index = 0;
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    const response = responses[index++];
    if (!response) {
      throw new Error(`Unexpected fetch call ${index}: ${url}`);
    }
    const status = response.status ?? 200;
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      text: async () =>
        typeof response.body === "string"
          ? response.body
          : JSON.stringify(response.body ?? {}),
    };
  };
}

// ---------------------------------------------------------------------------
// Helper: run a command handler directly (bypasses router error-catching)
// ---------------------------------------------------------------------------

async function runCommand(inputs, fetchResponses) {
  const command = inputs.command;
  clearInputs();
  setInputs({ "api-key": "sk_test", "api-url": "https://test.com", ...inputs });
  mockFetch(fetchResponses || [{ body: { ok: true } }]);
  const h = COMMANDS[command];
  if (!h) throw new Error(`Unknown command: ${command}`);
  await h();
  return fetchCalls[0];
}

// ---------------------------------------------------------------------------
// getApiUrl
// ---------------------------------------------------------------------------

describe("getApiUrl", () => {
  afterEach(() => clearInputs());

  it("appends /api to base URL", () => {
    setInputs({ "api-url": "https://api.iron.xyz" });
    assert.equal(getApiUrl(), "https://api.iron.xyz/api");
  });

  it("strips trailing slash before appending", () => {
    setInputs({ "api-url": "https://api.iron.xyz/" });
    assert.equal(getApiUrl(), "https://api.iron.xyz/api");
  });

  it("does not double /api", () => {
    setInputs({ "api-url": "https://api.iron.xyz/api" });
    assert.equal(getApiUrl(), "https://api.iron.xyz/api");
  });

  it("defaults to production URL when empty", () => {
    setInputs({});
    assert.equal(getApiUrl(), "https://api.iron.xyz/api");
  });

  it("works with sandbox URL", () => {
    setInputs({ "api-url": "https://api.sandbox.iron.xyz" });
    assert.equal(getApiUrl(), "https://api.sandbox.iron.xyz/api");
  });

  it("strips multiple trailing slashes", () => {
    setInputs({ "api-url": "https://api.iron.xyz///" });
    assert.equal(getApiUrl(), "https://api.iron.xyz/api");
  });
});

// ---------------------------------------------------------------------------
// buildHeaders
// ---------------------------------------------------------------------------

describe("buildHeaders", () => {
  afterEach(() => clearInputs());

  it("includes API key and content type", () => {
    setInputs({});
    const h = buildHeaders("sk_test_123", "list-autoramps");
    assert.equal(h["X-API-Key"], "sk_test_123");
    assert.equal(h["Content-Type"], "application/json");
    assert.equal(h.Accept, "application/json");
  });

  it("does not add idempotency for read commands", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "get-autoramp");
    assert.equal(h["IDEMPOTENCY-KEY"], undefined);
  });

  it("does not add idempotency for list commands", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "list-customers");
    assert.equal(h["IDEMPOTENCY-KEY"], undefined);
  });

  it("auto-generates idempotency for create- commands", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "create-autoramp");
    assert.ok(h["IDEMPOTENCY-KEY"]);
    assert.match(
      h["IDEMPOTENCY-KEY"],
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("auto-generates idempotency for register- commands", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "register-hosted-wallet");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("auto-generates idempotency for update- commands", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "update-customer");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("auto-generates idempotency for cancel-autoramp", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "cancel-autoramp");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("auto-generates idempotency for patch-autoramp", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "patch-autoramp");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("auto-generates idempotency for sandbox- commands", () => {
    setInputs({});
    const h = buildHeaders("sk_test", "sandbox-reset");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("uses explicit idempotency-key input when provided", () => {
    setInputs({ "idempotency-key": "my-custom-key" });
    const h = buildHeaders("sk_test", "create-autoramp");
    assert.equal(h["IDEMPOTENCY-KEY"], "my-custom-key");
  });

  it("uses explicit idempotency-key even for non-mutating commands", () => {
    setInputs({ "idempotency-key": "explicit-key" });
    const h = buildHeaders("sk_test", "list-autoramps");
    assert.equal(h["IDEMPOTENCY-KEY"], "explicit-key");
  });
});

// ---------------------------------------------------------------------------
// queryString
// ---------------------------------------------------------------------------

describe("queryString", () => {
  it("builds query string from params", () => {
    assert.equal(
      queryString({ customer_id: "c1", limit: "10" }),
      "?customer_id=c1&limit=10",
    );
  });

  it("omits empty values", () => {
    assert.equal(
      queryString({ customer_id: "c1", limit: "", offset: "" }),
      "?customer_id=c1",
    );
  });

  it("returns empty string when all values empty", () => {
    assert.equal(queryString({ a: "", b: "" }), "");
  });

  it("encodes special characters", () => {
    assert.equal(queryString({ q: "hello world" }), "?q=hello%20world");
  });

  it("handles single param", () => {
    assert.equal(queryString({ x: "1" }), "?x=1");
  });

  it("handles empty object", () => {
    assert.equal(queryString({}), "");
  });
});

// ---------------------------------------------------------------------------
// parseBody
// ---------------------------------------------------------------------------

describe("parseBody", () => {
  afterEach(() => clearInputs());

  it("parses valid JSON body input", () => {
    setInputs({ body: '{"key":"value"}' });
    const result = parseBody();
    assert.deepEqual(result, { key: "value" });
  });

  it("throws MISSING_INPUT when body is empty", () => {
    setInputs({});
    assert.throws(
      () => parseBody(),
      (err) => err instanceof W3ActionError && err.code === "MISSING_INPUT",
    );
  });

  it("throws on invalid JSON", () => {
    setInputs({ body: "not-json" });
    assert.throws(() => parseBody());
  });
});

// ---------------------------------------------------------------------------
// makeRequest
// ---------------------------------------------------------------------------

describe("makeRequest", () => {
  it("sends GET request to correct URL", async () => {
    mockFetch([{ body: { id: "123" } }]);
    const request = makeRequest("https://api.example.com/api", {
      "X-API-Key": "key",
    });
    const result = await request("GET", "/customers/123");
    assert.deepEqual(result, { id: "123" });
    assert.equal(
      fetchCalls[0].url,
      "https://api.example.com/api/customers/123",
    );
    assert.equal(fetchCalls[0].options.method, "GET");
  });

  it("sends POST with JSON body", async () => {
    mockFetch([{ body: { id: "new" } }]);
    const request = makeRequest("https://api.example.com/api", {});
    const result = await request("POST", "/items", { name: "test" });
    assert.deepEqual(result, { id: "new" });
    assert.equal(fetchCalls[0].options.body, '{"name":"test"}');
  });

  it("sends PUT with JSON body", async () => {
    mockFetch([{ body: { updated: true } }]);
    const request = makeRequest("https://api.example.com/api", {});
    await request("PUT", "/items/1", { name: "updated" });
    assert.equal(fetchCalls[0].options.method, "PUT");
    assert.equal(fetchCalls[0].options.body, '{"name":"updated"}');
  });

  it("sends PATCH with JSON body", async () => {
    mockFetch([{ body: { patched: true } }]);
    const request = makeRequest("https://api.example.com/api", {});
    await request("PATCH", "/items/1", { field: "val" });
    assert.equal(fetchCalls[0].options.method, "PATCH");
    assert.equal(fetchCalls[0].options.body, '{"field":"val"}');
  });

  it("does not send body for GET even if provided", async () => {
    mockFetch([{ body: {} }]);
    const request = makeRequest("https://api.example.com/api", {});
    await request("GET", "/items", { ignored: true });
    assert.equal(fetchCalls[0].options.body, undefined);
  });

  it("does not send body for DELETE even if provided", async () => {
    mockFetch([{ body: {} }]);
    const request = makeRequest("https://api.example.com/api", {});
    await request("DELETE", "/items/1", { ignored: true });
    assert.equal(fetchCalls[0].options.body, undefined);
  });

  it("returns null for 204 status", async () => {
    mockFetch([{ status: 204 }]);
    const request = makeRequest("https://api.example.com/api", {});
    const result = await request("DELETE", "/items/1");
    assert.equal(result, null);
  });

  it("returns parsed text when response is not JSON", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => "plain text response",
    });
    const request = makeRequest("https://api.example.com/api", {});
    const result = await request("GET", "/text-endpoint");
    assert.equal(result, "plain text response");
  });

  it("throws HTTP_ERROR on non-ok response with JSON body", async () => {
    mockFetch([{ status: 400, body: { error: "bad request" } }]);
    const request = makeRequest("https://api.example.com/api", {});
    await assert.rejects(
      () => request("GET", "/bad"),
      (err) => {
        assert.ok(err instanceof W3ActionError);
        assert.equal(err.code, "HTTP_ERROR");
        assert.ok(err.message.includes("400"));
        assert.equal(err.statusCode, 400);
        assert.deepEqual(err.details, { error: "bad request" });
        return true;
      },
    );
  });

  it("throws HTTP_ERROR on non-ok response with text body", async () => {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    const request = makeRequest("https://api.example.com/api", {});
    await assert.rejects(
      () => request("GET", "/error"),
      (err) => {
        assert.ok(err instanceof W3ActionError);
        assert.equal(err.code, "HTTP_ERROR");
        assert.ok(err.message.includes("500"));
        assert.ok(err.message.includes("Internal Server Error"));
        assert.equal(err.details, undefined);
        return true;
      },
    );
  });

  it("throws REQUEST_FAILED on network error", async () => {
    global.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const request = makeRequest("https://api.example.com/api", {});
    await assert.rejects(
      () => request("GET", "/fail"),
      (err) => {
        assert.ok(err instanceof W3ActionError);
        assert.equal(err.code, "REQUEST_FAILED");
        assert.ok(err.message.includes("ECONNREFUSED"));
        return true;
      },
    );
  });

  it("throws TIMEOUT on abort error", async () => {
    global.fetch = async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };
    const request = makeRequest("https://api.example.com/api", {});
    await assert.rejects(
      () => request("POST", "/slow"),
      (err) => {
        assert.ok(err instanceof W3ActionError);
        assert.equal(err.code, "TIMEOUT");
        assert.ok(err.message.includes("timed out"));
        return true;
      },
    );
  });

  it("passes headers to fetch", async () => {
    mockFetch([{ body: {} }]);
    const headers = {
      "X-API-Key": "test-key",
      "Content-Type": "application/json",
    };
    const request = makeRequest("https://api.example.com/api", headers);
    await request("GET", "/test");
    assert.equal(fetchCalls[0].options.headers["X-API-Key"], "test-key");
  });

  it("includes abort signal in fetch options", async () => {
    mockFetch([{ body: {} }]);
    const request = makeRequest("https://api.example.com/api", {});
    await request("GET", "/test");
    assert.ok(fetchCalls[0].options.signal instanceof AbortSignal);
  });
});

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

describe("setup", () => {
  afterEach(() => clearInputs());

  it("returns a request function", () => {
    setInputs({ "api-key": "sk_test", "api-url": "https://api.iron.xyz" });
    const { request } = setup("list-autoramps");
    assert.equal(typeof request, "function");
  });

  it("throws when api-key is missing", () => {
    setInputs({});
    assert.throws(() => setup("list-autoramps"), /required/i);
  });
});

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

describe("handler", () => {
  afterEach(() => clearInputs());

  it("calls fn with request and sets output", async () => {
    setInputs({ "api-key": "sk_test", "api-url": "https://test.com" });
    mockFetch([{ body: { result: "ok" } }]);
    const h = handler("list-autoramps", async (request) => {
      return request("GET", "/test");
    });
    await h();
  });

  it("propagates errors from fn", async () => {
    setInputs({ "api-key": "sk_test", "api-url": "https://test.com" });
    const h = handler("test-cmd", async () => {
      throw new W3ActionError("TEST_ERROR", "test failure");
    });
    await assert.rejects(
      () => h(),
      (err) => {
        assert.equal(err.code, "TEST_ERROR");
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Autoramp commands
// ---------------------------------------------------------------------------

describe("command: create-autoramp", () => {
  it("sends POST /autoramps with body", async () => {
    const call = await runCommand({
      command: "create-autoramp",
      body: '{"customer_id":"c1"}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/autoramps"));
    assert.equal(call.options.body, '{"customer_id":"c1"}');
  });

  it("fails without body", async () => {
    await assert.rejects(
      () => runCommand({ command: "create-autoramp" }),
      (err) => err.message.includes("body input is required"),
    );
  });
});

describe("command: get-autoramp", () => {
  it("sends GET /autoramps/:id", async () => {
    const call = await runCommand({
      command: "get-autoramp",
      "autoramp-id": "ar_1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/autoramps/ar_1"));
  });

  it("fails without autoramp-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-autoramp" }),
      (err) => err.message.includes("autoramp-id is required"),
    );
  });
});

describe("command: get-autoramp-by-external-id", () => {
  it("sends GET /autoramps/:id/external", async () => {
    const call = await runCommand({
      command: "get-autoramp-by-external-id",
      "external-id": "ext_1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/autoramps/ext_1/external"));
  });

  it("fails without external-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-autoramp-by-external-id" }),
      (err) => err.message.includes("external-id is required"),
    );
  });
});

describe("command: list-autoramps", () => {
  it("sends GET with query params", async () => {
    const call = await runCommand({
      command: "list-autoramps",
      "customer-id": "c1",
      limit: "10",
      offset: "0",
      status: "active",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("customer_id=c1"));
    assert.ok(call.url.includes("limit=10"));
    assert.ok(call.url.includes("offset=0"));
    assert.ok(call.url.includes("status=active"));
  });

  it("sends GET without query params when none provided", async () => {
    const call = await runCommand({ command: "list-autoramps" });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/autoramps"));
  });
});

describe("command: cancel-autoramp", () => {
  it("sends DELETE /autoramps/:id", async () => {
    const call = await runCommand({
      command: "cancel-autoramp",
      "autoramp-id": "ar_1",
    });
    assert.equal(call.options.method, "DELETE");
    assert.ok(call.url.endsWith("/api/autoramps/ar_1"));
  });

  it("fails without autoramp-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "cancel-autoramp" }),
      (err) => err.message.includes("autoramp-id is required"),
    );
  });
});

describe("command: patch-autoramp", () => {
  it("sends PATCH /autoramps/:id with body", async () => {
    const call = await runCommand({
      command: "patch-autoramp",
      "autoramp-id": "ar_1",
      body: '{"amount":"50"}',
    });
    assert.equal(call.options.method, "PATCH");
    assert.ok(call.url.endsWith("/api/autoramps/ar_1"));
    assert.equal(call.options.body, '{"amount":"50"}');
  });

  it("fails without autoramp-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "patch-autoramp", body: '{"x":1}' }),
      (err) => err.message.includes("autoramp-id is required"),
    );
  });
});

describe("command: get-quote", () => {
  it("sends GET with currency params", async () => {
    const call = await runCommand({
      command: "get-quote",
      "customer-id": "c1",
      "source-currency": "USD",
      "destination-currency": "USDC",
      "source-amount": "100",
      side: "buy",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("/autoramps/quote"));
    assert.ok(call.url.includes("customer_id=c1"));
    assert.ok(call.url.includes("source_currency=USD"));
    assert.ok(call.url.includes("destination_currency=USDC"));
  });
});

describe("command: check-limit", () => {
  it("sends GET with customer_id", async () => {
    const call = await runCommand({
      command: "check-limit",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("/autoramps/check-limit"));
    assert.ok(call.url.includes("customer_id=c1"));
  });
});

describe("command: retry-autoramp-auth", () => {
  it("sends POST /autoramps/:id/retry-auth", async () => {
    const call = await runCommand({
      command: "retry-autoramp-auth",
      "autoramp-id": "ar_1",
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/autoramps/ar_1/retry-auth"));
  });

  it("fails without autoramp-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "retry-autoramp-auth" }),
      (err) => err.message.includes("autoramp-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Open banking commands
// ---------------------------------------------------------------------------

describe("command: create-open-banking-payment", () => {
  it("sends POST with body", async () => {
    const call = await runCommand({
      command: "create-open-banking-payment",
      "autoramp-id": "ar_1",
      body: '{"amount":100}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/autoramps/ar_1/payments/open-banking"));
  });

  it("sends POST with empty body when no body input", async () => {
    const call = await runCommand({
      command: "create-open-banking-payment",
      "autoramp-id": "ar_1",
    });
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.body, "{}");
  });

  it("fails without autoramp-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "create-open-banking-payment" }),
      (err) => err.message.includes("autoramp-id is required"),
    );
  });
});

describe("command: get-open-banking-payment", () => {
  it("sends GET", async () => {
    const call = await runCommand({
      command: "get-open-banking-payment",
      "payment-id": "pay_1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/autoramps/payments/open-banking/pay_1"));
  });

  it("fails without payment-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-open-banking-payment" }),
      (err) => err.message.includes("payment-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Transaction commands
// ---------------------------------------------------------------------------

describe("command: list-transactions", () => {
  it("sends GET with filters", async () => {
    const call = await runCommand({
      command: "list-transactions",
      "customer-id": "c1",
      "autoramp-id": "ar_1",
      limit: "5",
      status: "completed",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("/autoramp-transactions"));
    assert.ok(call.url.includes("customer_id=c1"));
    assert.ok(call.url.includes("autoramp_id=ar_1"));
    assert.ok(call.url.includes("limit=5"));
    assert.ok(call.url.includes("status=completed"));
  });
});

describe("command: get-transactions-by-ids", () => {
  it("sends GET with ids param", async () => {
    const call = await runCommand({
      command: "get-transactions-by-ids",
      "transaction-ids": "tx_1,tx_2",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("/autoramp-transactions/ids"));
    assert.ok(call.url.includes("ids="));
  });

  it("fails without transaction-ids", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-transactions-by-ids" }),
      (err) => err.message.includes("transaction-ids is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Customer commands
// ---------------------------------------------------------------------------

describe("command: create-customer", () => {
  it("sends POST /customers with body", async () => {
    const call = await runCommand({
      command: "create-customer",
      body: '{"email":"a@b.com"}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/customers"));
  });
});

describe("command: get-customer", () => {
  it("sends GET /customers/:id", async () => {
    const call = await runCommand({
      command: "get-customer",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/customers/c1"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-customer" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

describe("command: get-customer-by-external-id", () => {
  it("sends GET /customers/:id/external", async () => {
    const call = await runCommand({
      command: "get-customer-by-external-id",
      "external-id": "ext_1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/customers/ext_1/external"));
  });

  it("fails without external-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-customer-by-external-id" }),
      (err) => err.message.includes("external-id is required"),
    );
  });
});

describe("command: update-customer", () => {
  it("sends PUT /customers/:id with body", async () => {
    const call = await runCommand({
      command: "update-customer",
      "customer-id": "c1",
      body: '{"email":"new@b.com"}',
    });
    assert.equal(call.options.method, "PUT");
    assert.ok(call.url.endsWith("/api/customers/c1"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "update-customer", body: '{"x":1}' }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

describe("command: list-customers", () => {
  it("sends GET with pagination", async () => {
    const call = await runCommand({
      command: "list-customers",
      limit: "20",
      offset: "0",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("limit=20"));
    assert.ok(call.url.includes("offset=0"));
  });
});

describe("command: get-customer-abilities", () => {
  it("sends GET /customers/:id/abilities", async () => {
    const call = await runCommand({
      command: "get-customer-abilities",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/customers/c1/abilities"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-customer-abilities" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// KYC / Identification commands
// ---------------------------------------------------------------------------

describe("command: create-identification", () => {
  it("sends POST to v2 endpoint", async () => {
    const call = await runCommand({
      command: "create-identification",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/customers/c1/identifications/v2"));
  });

  it("sends body when provided", async () => {
    const call = await runCommand({
      command: "create-identification",
      "customer-id": "c1",
      body: '{"type":"passport"}',
    });
    assert.equal(call.options.body, '{"type":"passport"}');
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "create-identification" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

describe("command: get-identification", () => {
  it("sends GET /identifications/:id", async () => {
    const call = await runCommand({
      command: "get-identification",
      "address-id": "id_1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/identifications/id_1"));
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-identification" }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

describe("command: list-identifications", () => {
  it("sends GET /customers/:id/identifications", async () => {
    const call = await runCommand({
      command: "list-identifications",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/customers/c1/identifications"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "list-identifications" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

describe("command: get-compliance-questionnaire", () => {
  it("sends GET /identifications/:id/compliance-questionnaire", async () => {
    const call = await runCommand({
      command: "get-compliance-questionnaire",
      "address-id": "id_1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(
      call.url.endsWith("/api/identifications/id_1/compliance-questionnaire"),
    );
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-compliance-questionnaire" }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Signing commands
// ---------------------------------------------------------------------------

describe("command: create-signing", () => {
  it("sends POST /customers/:id/signings", async () => {
    const call = await runCommand({
      command: "create-signing",
      "customer-id": "c1",
      body: '{"type":"terms"}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/customers/c1/signings"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "create-signing", body: '{"type":"terms"}' }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

describe("command: list-signings", () => {
  it("sends GET /customers/:id/signings", async () => {
    const call = await runCommand({
      command: "list-signings",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/customers/c1/signings"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "list-signings" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

describe("command: get-required-signings", () => {
  it("sends GET /customers/:id/required-signings", async () => {
    const call = await runCommand({
      command: "get-required-signings",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/customers/c1/required-signings"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-required-signings" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Crypto address commands
// ---------------------------------------------------------------------------

describe("command: register-hosted-wallet", () => {
  it("sends POST /addresses/crypto/hosted", async () => {
    const call = await runCommand({
      command: "register-hosted-wallet",
      body: '{"customer_id":"c1","address":"0xabc"}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/addresses/crypto/hosted"));
  });
});

describe("command: register-selfhosted-wallet", () => {
  it("sends POST /addresses/crypto/selfhosted", async () => {
    const call = await runCommand({
      command: "register-selfhosted-wallet",
      body: '{"customer_id":"c1","address":"0xdef"}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/addresses/crypto/selfhosted"));
  });
});

describe("command: list-crypto-addresses", () => {
  it("sends GET /addresses/crypto/:id", async () => {
    const call = await runCommand({
      command: "list-crypto-addresses",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/addresses/crypto/c1"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "list-crypto-addresses" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

describe("command: disable-crypto-address", () => {
  it("sends PUT /addresses/crypto/:id/disabled", async () => {
    const call = await runCommand({
      command: "disable-crypto-address",
      "address-id": "addr_1",
      body: '{"disabled":true}',
    });
    assert.equal(call.options.method, "PUT");
    assert.ok(call.url.endsWith("/api/addresses/crypto/addr_1/disabled"));
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () =>
        runCommand({
          command: "disable-crypto-address",
          body: '{"disabled":true}',
        }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

describe("command: search-vasps", () => {
  it("sends GET with query", async () => {
    const call = await runCommand({
      command: "search-vasps",
      "vasp-query": "coinbase",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("/addresses/crypto/hosted/vasps"));
    assert.ok(call.url.includes("query=coinbase"));
  });
});

// ---------------------------------------------------------------------------
// Bank account commands
// ---------------------------------------------------------------------------

describe("command: register-bank-account", () => {
  it("sends POST /addresses/fiat", async () => {
    const call = await runCommand({
      command: "register-bank-account",
      body: '{"customer_id":"c1"}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/addresses/fiat"));
  });
});

describe("command: list-bank-accounts", () => {
  it("sends GET for customer when customer-id provided", async () => {
    const call = await runCommand({
      command: "list-bank-accounts",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/addresses/fiat/c1"));
  });

  it("sends GET with pagination when no customer-id", async () => {
    const call = await runCommand({
      command: "list-bank-accounts",
      limit: "10",
      offset: "0",
      status: "active",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("/addresses/fiat"));
    assert.ok(call.url.includes("limit=10"));
    assert.ok(call.url.includes("status=active"));
  });
});

describe("command: get-bank-account", () => {
  it("sends GET /addresses/fiat/:customer/:address", async () => {
    const call = await runCommand({
      command: "get-bank-account",
      "customer-id": "c1",
      "address-id": "a1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/addresses/fiat/c1/a1"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-bank-account", "address-id": "a1" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-bank-account", "customer-id": "c1" }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

describe("command: delete-bank-account", () => {
  it("sends DELETE /addresses/fiat/:customer/:address", async () => {
    const call = await runCommand({
      command: "delete-bank-account",
      "customer-id": "c1",
      "address-id": "a1",
    });
    assert.equal(call.options.method, "DELETE");
    assert.ok(call.url.endsWith("/api/addresses/fiat/c1/a1"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "delete-bank-account", "address-id": "a1" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "delete-bank-account", "customer-id": "c1" }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

describe("command: retry-bank-auth", () => {
  it("sends POST /addresses/fiat/:id/retry-auth", async () => {
    const call = await runCommand({
      command: "retry-bank-auth",
      "address-id": "a1",
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/addresses/fiat/a1/retry-auth"));
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "retry-bank-auth" }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Auth code commands
// ---------------------------------------------------------------------------

describe("command: get-auth-code", () => {
  it("sends GET /authentication-codes/entity/:id", async () => {
    const call = await runCommand({
      command: "get-auth-code",
      "address-id": "e1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/authentication-codes/entity/e1"));
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-auth-code" }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

describe("command: submit-auth-code", () => {
  it("sends PUT /authentication-codes/:id with body", async () => {
    const call = await runCommand({
      command: "submit-auth-code",
      "address-id": "ac1",
      body: '{"code":"123456"}',
    });
    assert.equal(call.options.method, "PUT");
    assert.ok(call.url.endsWith("/api/authentication-codes/ac1"));
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "submit-auth-code", body: '{"code":"123"}' }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Microdeposits
// ---------------------------------------------------------------------------

describe("command: get-microdeposits", () => {
  it("sends GET /customers/:id/microdeposits", async () => {
    const call = await runCommand({
      command: "get-microdeposits",
      "customer-id": "c1",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/customers/c1/microdeposits"));
  });

  it("fails without customer-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-microdeposits" }),
      (err) => err.message.includes("customer-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Reference data commands
// ---------------------------------------------------------------------------

describe("command: list-cryptocurrencies", () => {
  it("sends GET /cryptocurrencies", async () => {
    const call = await runCommand({ command: "list-cryptocurrencies" });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/cryptocurrencies"));
  });
});

describe("command: list-fiat-currencies", () => {
  it("sends GET /fiatcurrencies", async () => {
    const call = await runCommand({ command: "list-fiat-currencies" });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/fiatcurrencies"));
  });
});

describe("command: get-exchange-rate", () => {
  it("classifies fiat vs crypto currencies", async () => {
    const call = await runCommand({
      command: "get-exchange-rate",
      "source-currency": "USD",
      "destination-currency": "USDC",
      "source-amount": "100",
    });
    assert.ok(call.url.includes("source_currency_type=fiat"));
    assert.ok(call.url.includes("destination_currency_type=crypto"));
  });

  it("uses base-currency and quote-currency as fallbacks", async () => {
    const call = await runCommand({
      command: "get-exchange-rate",
      "base-currency": "EUR",
      "quote-currency": "BTC",
      "source-amount": "50",
    });
    assert.ok(call.url.includes("source_currency_code=EUR"));
    assert.ok(call.url.includes("destination_currency_code=BTC"));
    assert.ok(call.url.includes("source_currency_type=fiat"));
    assert.ok(call.url.includes("destination_currency_type=crypto"));
  });

  it("adds chain defaults for crypto currencies", async () => {
    const call = await runCommand({
      command: "get-exchange-rate",
      "source-currency": "USDC",
      "destination-currency": "ETH",
      "source-amount": "100",
    });
    assert.ok(call.url.includes("source_currency_chain=Ethereum"));
    assert.ok(call.url.includes("destination_currency_chain=Ethereum"));
  });

  it("uses explicit chain when provided", async () => {
    const call = await runCommand({
      command: "get-exchange-rate",
      "source-currency": "USDC",
      "destination-currency": "ETH",
      "source-chain": "Polygon",
      "destination-chain": "Arbitrum",
      "source-amount": "100",
    });
    assert.ok(call.url.includes("source_currency_chain=Polygon"));
    assert.ok(call.url.includes("destination_currency_chain=Arbitrum"));
  });

  it("does not add chain for fiat currencies", async () => {
    const call = await runCommand({
      command: "get-exchange-rate",
      "source-currency": "USD",
      "destination-currency": "EUR",
      "source-amount": "100",
    });
    // Fiat currencies should have empty chain, so no chain param in URL
    assert.ok(!call.url.includes("source_currency_chain="));
    assert.ok(!call.url.includes("destination_currency_chain="));
  });
});

describe("command: get-fee-profiles", () => {
  it("sends GET /fee-profiles", async () => {
    const call = await runCommand({ command: "get-fee-profiles" });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/fee-profiles"));
  });
});

describe("command: get-terms", () => {
  it("sends GET with country param", async () => {
    const call = await runCommand({
      command: "get-terms",
      "country-code": "US",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.includes("country=US"));
  });
});

describe("command: get-country-subdivisions", () => {
  it("sends GET /country_subdivisions/:code", async () => {
    const call = await runCommand({
      command: "get-country-subdivisions",
      "country-code": "US",
    });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/country_subdivisions/US"));
  });

  it("fails without country-code", async () => {
    await assert.rejects(
      () => runCommand({ command: "get-country-subdivisions" }),
      (err) => err.message.includes("country-code is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Webhook commands
// ---------------------------------------------------------------------------

describe("command: list-webhooks", () => {
  it("sends GET /webhooks", async () => {
    const call = await runCommand({ command: "list-webhooks" });
    assert.equal(call.options.method, "GET");
    assert.ok(call.url.endsWith("/api/webhooks"));
  });
});

describe("command: update-webhook", () => {
  it("sends PATCH /webhooks/:id with body", async () => {
    const call = await runCommand({
      command: "update-webhook",
      "webhook-id": "wh_1",
      body: '{"url":"https://example.com"}',
    });
    assert.equal(call.options.method, "PATCH");
    assert.ok(call.url.endsWith("/api/webhooks/wh_1"));
  });

  it("fails without webhook-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "update-webhook", body: '{"url":"x"}' }),
      (err) => err.message.includes("webhook-id is required"),
    );
  });
});

describe("command: ping-webhook", () => {
  it("sends POST /webhooks/:id/ping", async () => {
    const call = await runCommand({
      command: "ping-webhook",
      "webhook-id": "wh_1",
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/webhooks/wh_1/ping"));
  });

  it("fails without webhook-id", async () => {
    await assert.rejects(
      () => runCommand({ command: "ping-webhook" }),
      (err) => err.message.includes("webhook-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// Sandbox commands
// ---------------------------------------------------------------------------

describe("command: sandbox-reset", () => {
  it("sends POST /sandbox/reset", async () => {
    const call = await runCommand({ command: "sandbox-reset" });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/sandbox/reset"));
  });
});

describe("command: sandbox-mock-transaction", () => {
  it("sends POST /sandbox/transaction with body", async () => {
    const call = await runCommand({
      command: "sandbox-mock-transaction",
      body: '{"autoramp_id":"ar_1"}',
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/sandbox/transaction"));
  });
});

describe("command: sandbox-update-autoramp", () => {
  it("sends PUT with sandbox-status", async () => {
    const call = await runCommand({
      command: "sandbox-update-autoramp",
      "autoramp-id": "ar_1",
      "sandbox-status": "completed",
    });
    assert.equal(call.options.method, "PUT");
    assert.ok(call.url.endsWith("/api/sandbox/autoramp/ar_1"));
    const body = JSON.parse(call.options.body);
    assert.equal(body.status, "completed");
  });

  it("falls back to body.status when sandbox-status empty", async () => {
    const call = await runCommand({
      command: "sandbox-update-autoramp",
      "autoramp-id": "ar_1",
      body: '{"status":"active"}',
    });
    const body = JSON.parse(call.options.body);
    assert.equal(body.status, "active");
  });

  it("fails without autoramp-id", async () => {
    await assert.rejects(
      () =>
        runCommand({
          command: "sandbox-update-autoramp",
          "sandbox-status": "x",
        }),
      (err) => err.message.includes("autoramp-id is required"),
    );
  });
});

describe("command: sandbox-update-fiat-verification", () => {
  it("sends PUT with status", async () => {
    const call = await runCommand({
      command: "sandbox-update-fiat-verification",
      "address-id": "a1",
      "sandbox-status": "verified",
    });
    assert.equal(call.options.method, "PUT");
    assert.ok(call.url.endsWith("/api/sandbox/fiat-verification/a1"));
    const body = JSON.parse(call.options.body);
    assert.equal(body.status, "verified");
  });

  it("falls back to body.status when sandbox-status empty", async () => {
    const call = await runCommand({
      command: "sandbox-update-fiat-verification",
      "address-id": "a1",
      body: '{"status":"pending"}',
    });
    const body = JSON.parse(call.options.body);
    assert.equal(body.status, "pending");
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () =>
        runCommand({
          command: "sandbox-update-fiat-verification",
          "sandbox-status": "x",
        }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

describe("command: sandbox-update-identification", () => {
  it("sends POST with status", async () => {
    const call = await runCommand({
      command: "sandbox-update-identification",
      "address-id": "id_1",
      "sandbox-status": "approved",
    });
    assert.equal(call.options.method, "POST");
    assert.ok(call.url.endsWith("/api/sandbox/identification/id_1"));
    const body = JSON.parse(call.options.body);
    assert.equal(body.status, "approved");
  });

  it("falls back to body.status when sandbox-status empty", async () => {
    const call = await runCommand({
      command: "sandbox-update-identification",
      "address-id": "id_1",
      body: '{"status":"rejected"}',
    });
    const body = JSON.parse(call.options.body);
    assert.equal(body.status, "rejected");
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () =>
        runCommand({
          command: "sandbox-update-identification",
          "sandbox-status": "x",
        }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

describe("command: sandbox-update-transaction", () => {
  it("sends PUT with state", async () => {
    const call = await runCommand({
      command: "sandbox-update-transaction",
      "address-id": "tx_1",
      "sandbox-status": "settled",
    });
    assert.equal(call.options.method, "PUT");
    assert.ok(call.url.endsWith("/api/sandbox/transaction/tx_1/state"));
    const body = JSON.parse(call.options.body);
    assert.equal(body.state, "settled");
  });

  it("falls back to body.state when sandbox-status empty", async () => {
    const call = await runCommand({
      command: "sandbox-update-transaction",
      "address-id": "tx_1",
      body: '{"state":"failed"}',
    });
    const body = JSON.parse(call.options.body);
    assert.equal(body.state, "failed");
  });

  it("fails without address-id", async () => {
    await assert.rejects(
      () =>
        runCommand({
          command: "sandbox-update-transaction",
          "sandbox-status": "x",
        }),
      (err) => err.message.includes("address-id is required"),
    );
  });
});

// ---------------------------------------------------------------------------
// createRouter / COMMANDS
// ---------------------------------------------------------------------------

describe("createRouter", () => {
  it("returns a function", () => {
    const router = createRouter();
    assert.equal(typeof router, "function");
  });
});

describe("COMMANDS", () => {
  it("exports all expected command keys", () => {
    const expected = [
      "create-autoramp",
      "get-autoramp",
      "get-autoramp-by-external-id",
      "list-autoramps",
      "cancel-autoramp",
      "patch-autoramp",
      "get-quote",
      "check-limit",
      "retry-autoramp-auth",
      "create-open-banking-payment",
      "get-open-banking-payment",
      "list-transactions",
      "get-transactions-by-ids",
      "create-customer",
      "get-customer",
      "get-customer-by-external-id",
      "update-customer",
      "list-customers",
      "get-customer-abilities",
      "create-identification",
      "get-identification",
      "list-identifications",
      "get-compliance-questionnaire",
      "create-signing",
      "list-signings",
      "get-required-signings",
      "register-hosted-wallet",
      "register-selfhosted-wallet",
      "list-crypto-addresses",
      "disable-crypto-address",
      "search-vasps",
      "register-bank-account",
      "list-bank-accounts",
      "get-bank-account",
      "delete-bank-account",
      "retry-bank-auth",
      "get-auth-code",
      "submit-auth-code",
      "get-microdeposits",
      "list-cryptocurrencies",
      "list-fiat-currencies",
      "get-exchange-rate",
      "get-fee-profiles",
      "get-terms",
      "get-country-subdivisions",
      "list-webhooks",
      "update-webhook",
      "ping-webhook",
      "sandbox-reset",
      "sandbox-mock-transaction",
      "sandbox-update-autoramp",
      "sandbox-update-fiat-verification",
      "sandbox-update-identification",
      "sandbox-update-transaction",
    ];
    const actual = Object.keys(COMMANDS).sort();
    assert.deepEqual(actual, expected.sort());
  });

  it("each command is an async function", () => {
    for (const [name, fn] of Object.entries(COMMANDS)) {
      assert.equal(typeof fn, "function", `${name} should be a function`);
    }
  });
});
