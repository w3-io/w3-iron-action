/**
 * Iron action unit + integration tests.
 *
 * Unit tests reproduce helper logic (URL construction, headers, query strings).
 * Integration tests spawn the action as a subprocess with mocked env vars and
 * a tiny HTTP server standing in for the Iron API.
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Unit tests: reproduce helper functions from src/index.js
// ---------------------------------------------------------------------------

function getApiUrl(raw) {
  const url = raw || "https://api.iron.xyz";
  return url.endsWith("/api") ? url : `${url.replace(/\/+$/, "")}/api`;
}

function queryString(params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

function buildHeaders(apiKey, command) {
  const headers = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (
    command.startsWith("create-") ||
    command.startsWith("register-") ||
    command.startsWith("update-") ||
    command === "cancel-autoramp" ||
    command === "patch-autoramp" ||
    command.startsWith("sandbox-")
  ) {
    headers["IDEMPOTENCY-KEY"] = "test-uuid";
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Unit: URL construction
// ---------------------------------------------------------------------------

describe("getApiUrl", () => {
  it("appends /api to base URL", () => {
    assert.equal(getApiUrl("https://api.iron.xyz"), "https://api.iron.xyz/api");
  });

  it("strips trailing slash before appending /api", () => {
    assert.equal(
      getApiUrl("https://api.iron.xyz/"),
      "https://api.iron.xyz/api",
    );
  });

  it("does not double /api", () => {
    assert.equal(
      getApiUrl("https://api.iron.xyz/api"),
      "https://api.iron.xyz/api",
    );
  });

  it("defaults to production URL", () => {
    assert.equal(getApiUrl(""), "https://api.iron.xyz/api");
  });

  it("works with sandbox URL", () => {
    assert.equal(
      getApiUrl("https://api.sandbox.iron.xyz"),
      "https://api.sandbox.iron.xyz/api",
    );
  });
});

// ---------------------------------------------------------------------------
// Unit: query string builder
// ---------------------------------------------------------------------------

describe("queryString", () => {
  it("builds query string from params", () => {
    const qs = queryString({ customer_id: "cust_1", limit: "10" });
    assert.equal(qs, "?customer_id=cust_1&limit=10");
  });

  it("omits empty values", () => {
    const qs = queryString({ customer_id: "cust_1", limit: "", offset: "" });
    assert.equal(qs, "?customer_id=cust_1");
  });

  it("returns empty string when all values empty", () => {
    const qs = queryString({ limit: "", offset: "" });
    assert.equal(qs, "");
  });

  it("encodes special characters", () => {
    const qs = queryString({ query: "hello world" });
    assert.equal(qs, "?query=hello%20world");
  });
});

// ---------------------------------------------------------------------------
// Unit: header construction
// ---------------------------------------------------------------------------

describe("buildHeaders", () => {
  it("includes API key", () => {
    const h = buildHeaders("sk_test_123", "list-autoramps");
    assert.equal(h["X-API-Key"], "sk_test_123");
  });

  it("includes content type and accept", () => {
    const h = buildHeaders("sk_test_123", "list-autoramps");
    assert.equal(h["Content-Type"], "application/json");
    assert.equal(h.Accept, "application/json");
  });

  it("adds idempotency key for create- commands", () => {
    const h = buildHeaders("sk_test_123", "create-autoramp");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("adds idempotency key for register- commands", () => {
    const h = buildHeaders("sk_test_123", "register-hosted-wallet");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("adds idempotency key for update- commands", () => {
    const h = buildHeaders("sk_test_123", "update-customer");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("adds idempotency key for sandbox- commands", () => {
    const h = buildHeaders("sk_test_123", "sandbox-reset");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("adds idempotency key for cancel-autoramp", () => {
    const h = buildHeaders("sk_test_123", "cancel-autoramp");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("adds idempotency key for patch-autoramp", () => {
    const h = buildHeaders("sk_test_123", "patch-autoramp");
    assert.ok(h["IDEMPOTENCY-KEY"]);
  });

  it("does not add idempotency key for GET commands", () => {
    const h = buildHeaders("sk_test_123", "get-autoramp");
    assert.equal(h["IDEMPOTENCY-KEY"], undefined);
  });

  it("does not add idempotency key for list- commands", () => {
    const h = buildHeaders("sk_test_123", "list-autoramps");
    assert.equal(h["IDEMPOTENCY-KEY"], undefined);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: spawn the action with a mock HTTP server
// ---------------------------------------------------------------------------

let server;
let serverPort;
let lastRequest;

async function startServer(responseBody, statusCode = 200) {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        lastRequest = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body || undefined,
        };
        if (statusCode === 204) {
          res.writeHead(204);
          res.end();
        } else {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(responseBody));
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(resolve);
      server = null;
    } else {
      resolve();
    }
  });
}

async function runAction(inputs) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(inputs)) {
    env[`INPUT_${key.toUpperCase()}`] = value;
  }
  env["INPUT_API-KEY"] = inputs["api-key"] || "test-api-key";
  env["INPUT_API-URL"] = `http://127.0.0.1:${serverPort}`;

  try {
    const { stdout, stderr } = await execFileAsync("node", ["dist/index.js"], {
      cwd: PROJECT_ROOT,
      env,
      timeout: 10000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout, stderr: err.stderr, exitCode: err.code };
  }
}

// ---------------------------------------------------------------------------
// Integration: Autoramps group
// ---------------------------------------------------------------------------

describe("integration: autoramps", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("create-autoramp sends POST /api/autoramps with body", async () => {
    await startServer({ id: "ar_1", status: "pending" });
    const body = JSON.stringify({
      customer_id: "cust_1",
      source_currency: "USD",
    });
    await runAction({ command: "create-autoramp", body });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/autoramps");
    const parsed = JSON.parse(lastRequest.body);
    assert.equal(parsed.customer_id, "cust_1");
  });

  it("get-autoramp sends GET /api/autoramps/:id", async () => {
    await startServer({ id: "ar_1", status: "active" });
    await runAction({ command: "get-autoramp", "autoramp-id": "ar_1" });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/autoramps/ar_1");
  });

  it("get-autoramp fails without autoramp-id", async () => {
    await startServer({});
    const result = await runAction({ command: "get-autoramp" });
    assert.ok(
      result.stderr.includes("autoramp-id is required") ||
        result.stdout.includes("autoramp-id is required"),
    );
  });

  it("get-autoramp-by-external-id sends GET with /external", async () => {
    await startServer({ id: "ar_1" });
    await runAction({
      command: "get-autoramp-by-external-id",
      "external-id": "ext_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/autoramps/ext_1/external");
  });

  it("list-autoramps sends GET with query params", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "list-autoramps",
      "customer-id": "cust_1",
      limit: "10",
      status: "active",
    });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.includes("customer_id=cust_1"));
    assert.ok(lastRequest.url.includes("limit=10"));
    assert.ok(lastRequest.url.includes("status=active"));
  });

  it("cancel-autoramp sends DELETE", async () => {
    await startServer({ id: "ar_1", status: "cancelled" });
    await runAction({ command: "cancel-autoramp", "autoramp-id": "ar_1" });
    assert.equal(lastRequest.method, "DELETE");
    assert.equal(lastRequest.url, "/api/autoramps/ar_1");
  });

  it("patch-autoramp sends PATCH with body", async () => {
    await startServer({ id: "ar_1" });
    const body = JSON.stringify({ destination_amount: "100" });
    await runAction({
      command: "patch-autoramp",
      "autoramp-id": "ar_1",
      body,
    });
    assert.equal(lastRequest.method, "PATCH");
    assert.equal(lastRequest.url, "/api/autoramps/ar_1");
  });

  it("get-quote sends GET with currency params", async () => {
    await startServer({ effective_rate: "1.0" });
    await runAction({
      command: "get-quote",
      "customer-id": "cust_1",
      "source-currency": "USD",
      "destination-currency": "USDC",
      "source-amount": "100",
    });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.startsWith("/api/autoramps/quote"));
    assert.ok(lastRequest.url.includes("source_currency=USD"));
    assert.ok(lastRequest.url.includes("destination_currency=USDC"));
  });

  it("check-limit sends GET with customer_id", async () => {
    await startServer({ limit: 10000 });
    await runAction({ command: "check-limit", "customer-id": "cust_1" });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.startsWith("/api/autoramps/check-limit"));
    assert.ok(lastRequest.url.includes("customer_id=cust_1"));
  });

  it("retry-autoramp-auth sends POST", async () => {
    await startServer({ id: "ar_1" });
    await runAction({
      command: "retry-autoramp-auth",
      "autoramp-id": "ar_1",
    });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/autoramps/ar_1/retry-auth");
  });
});

// ---------------------------------------------------------------------------
// Integration: Open banking payments
// ---------------------------------------------------------------------------

describe("integration: open banking", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("create-open-banking-payment sends POST", async () => {
    await startServer({ id: "pay_1" });
    await runAction({
      command: "create-open-banking-payment",
      "autoramp-id": "ar_1",
      body: JSON.stringify({ amount: 100 }),
    });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/autoramps/ar_1/payments/open-banking");
  });

  it("get-open-banking-payment sends GET", async () => {
    await startServer({ id: "pay_1" });
    await runAction({
      command: "get-open-banking-payment",
      "payment-id": "pay_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/autoramps/payments/open-banking/pay_1");
  });
});

// ---------------------------------------------------------------------------
// Integration: Transactions
// ---------------------------------------------------------------------------

describe("integration: transactions", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("list-transactions sends GET with filters", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "list-transactions",
      "customer-id": "cust_1",
      "autoramp-id": "ar_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.startsWith("/api/autoramp-transactions"));
    assert.ok(lastRequest.url.includes("customer_id=cust_1"));
    assert.ok(lastRequest.url.includes("autoramp_id=ar_1"));
  });

  it("get-transactions-by-ids sends GET with ids param", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "get-transactions-by-ids",
      "transaction-ids": "tx_1,tx_2",
    });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.includes("ids=tx_1%2Ctx_2"));
  });
});

// ---------------------------------------------------------------------------
// Integration: Customers
// ---------------------------------------------------------------------------

describe("integration: customers", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("create-customer sends POST /api/customers", async () => {
    await startServer({ id: "cust_1" });
    const body = JSON.stringify({ customer_type: "Person", email: "a@b.com" });
    await runAction({ command: "create-customer", body });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/customers");
    const parsed = JSON.parse(lastRequest.body);
    assert.equal(parsed.email, "a@b.com");
  });

  it("get-customer sends GET /api/customers/:id", async () => {
    await startServer({ id: "cust_1" });
    await runAction({ command: "get-customer", "customer-id": "cust_1" });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/customers/cust_1");
  });

  it("update-customer sends PUT with body", async () => {
    await startServer({ id: "cust_1" });
    const body = JSON.stringify({ email: "new@b.com" });
    await runAction({
      command: "update-customer",
      "customer-id": "cust_1",
      body,
    });
    assert.equal(lastRequest.method, "PUT");
    assert.equal(lastRequest.url, "/api/customers/cust_1");
  });

  it("list-customers sends GET with pagination", async () => {
    await startServer({ items: [] });
    await runAction({ command: "list-customers", limit: "20", offset: "0" });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.includes("limit=20"));
  });

  it("get-customer-abilities sends GET", async () => {
    await startServer({ abilities: [] });
    await runAction({
      command: "get-customer-abilities",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/customers/cust_1/abilities");
  });
});

// ---------------------------------------------------------------------------
// Integration: KYC / Identifications
// ---------------------------------------------------------------------------

describe("integration: KYC", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("create-identification sends POST to v2 endpoint", async () => {
    await startServer({ id: "id_1" });
    await runAction({
      command: "create-identification",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/customers/cust_1/identifications/v2");
  });

  it("get-identification sends GET", async () => {
    await startServer({ id: "id_1" });
    await runAction({
      command: "get-identification",
      "address-id": "id_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/identifications/id_1");
  });

  it("list-identifications sends GET for customer", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "list-identifications",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/customers/cust_1/identifications");
  });

  it("get-compliance-questionnaire sends GET", async () => {
    await startServer({ questions: [] });
    await runAction({
      command: "get-compliance-questionnaire",
      "address-id": "id_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(
      lastRequest.url,
      "/api/identifications/id_1/compliance-questionnaire",
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: Signings
// ---------------------------------------------------------------------------

describe("integration: signings", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("create-signing sends POST", async () => {
    await startServer({ id: "sig_1" });
    const body = JSON.stringify({ document_type: "terms" });
    await runAction({
      command: "create-signing",
      "customer-id": "cust_1",
      body,
    });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/customers/cust_1/signings");
  });

  it("list-signings sends GET", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "list-signings",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/customers/cust_1/signings");
  });

  it("get-required-signings sends GET", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "get-required-signings",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/customers/cust_1/required-signings");
  });
});

// ---------------------------------------------------------------------------
// Integration: Crypto addresses
// ---------------------------------------------------------------------------

describe("integration: crypto addresses", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("register-hosted-wallet sends POST", async () => {
    await startServer({ id: "addr_1" });
    const body = JSON.stringify({
      customer_id: "cust_1",
      address: "0xabc",
      chain: "Ethereum",
    });
    await runAction({ command: "register-hosted-wallet", body });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/addresses/crypto/hosted");
  });

  it("register-selfhosted-wallet sends POST", async () => {
    await startServer({ id: "addr_1" });
    const body = JSON.stringify({
      customer_id: "cust_1",
      address: "0xdef",
    });
    await runAction({ command: "register-selfhosted-wallet", body });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/addresses/crypto/selfhosted");
  });

  it("list-crypto-addresses sends GET for customer", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "list-crypto-addresses",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/addresses/crypto/cust_1");
  });

  it("search-vasps sends GET with query", async () => {
    await startServer({ items: [] });
    await runAction({ command: "search-vasps", "vasp-query": "coinbase" });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.startsWith("/api/addresses/crypto/hosted/vasps"));
    assert.ok(lastRequest.url.includes("query=coinbase"));
  });
});

// ---------------------------------------------------------------------------
// Integration: Fiat addresses (bank accounts)
// ---------------------------------------------------------------------------

describe("integration: bank accounts", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("register-bank-account sends POST", async () => {
    await startServer({ id: "bank_1" });
    const body = JSON.stringify({
      customer_id: "cust_1",
      deposit_rail: "ach",
    });
    await runAction({ command: "register-bank-account", body });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/addresses/fiat");
  });

  it("list-bank-accounts with customer-id sends GET for customer", async () => {
    await startServer({ items: [] });
    await runAction({
      command: "list-bank-accounts",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/addresses/fiat/cust_1");
  });

  it("get-bank-account sends GET with customer and address", async () => {
    await startServer({ id: "bank_1" });
    await runAction({
      command: "get-bank-account",
      "customer-id": "cust_1",
      "address-id": "addr_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/addresses/fiat/cust_1/addr_1");
  });

  it("delete-bank-account sends DELETE", async () => {
    await startServer({ deleted: true });
    await runAction({
      command: "delete-bank-account",
      "customer-id": "cust_1",
      "address-id": "addr_1",
    });
    assert.equal(lastRequest.method, "DELETE");
    assert.equal(lastRequest.url, "/api/addresses/fiat/cust_1/addr_1");
  });

  it("retry-bank-auth sends POST", async () => {
    await startServer({ id: "addr_1" });
    await runAction({
      command: "retry-bank-auth",
      "address-id": "addr_1",
    });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/addresses/fiat/addr_1/retry-auth");
  });
});

// ---------------------------------------------------------------------------
// Integration: Auth codes
// ---------------------------------------------------------------------------

describe("integration: auth codes", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("get-auth-code sends GET", async () => {
    await startServer({ code: "123456" });
    await runAction({ command: "get-auth-code", "address-id": "entity_1" });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/authentication-codes/entity/entity_1");
  });

  it("submit-auth-code sends PUT with body", async () => {
    await startServer({ verified: true });
    const body = JSON.stringify({ code: "123456" });
    await runAction({
      command: "submit-auth-code",
      "address-id": "ac_1",
      body,
    });
    assert.equal(lastRequest.method, "PUT");
    assert.equal(lastRequest.url, "/api/authentication-codes/ac_1");
  });
});

// ---------------------------------------------------------------------------
// Integration: Reference data
// ---------------------------------------------------------------------------

describe("integration: reference data", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("list-cryptocurrencies sends GET /api/cryptocurrencies", async () => {
    await startServer([{ code: "USDC" }]);
    await runAction({ command: "list-cryptocurrencies" });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/cryptocurrencies");
  });

  it("list-fiat-currencies sends GET /api/fiatcurrencies", async () => {
    await startServer([{ code: "USD" }]);
    await runAction({ command: "list-fiat-currencies" });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/fiatcurrencies");
  });

  it("get-exchange-rate builds correct query params", async () => {
    await startServer({ effective_rate: "1.0" });
    await runAction({
      command: "get-exchange-rate",
      "source-currency": "USD",
      "destination-currency": "USDC",
      "source-amount": "100",
    });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.startsWith("/api/exchange-rate"));
    assert.ok(lastRequest.url.includes("source_currency_code=USD"));
    assert.ok(lastRequest.url.includes("destination_currency_code=USDC"));
    assert.ok(lastRequest.url.includes("source_currency_type=fiat"));
    assert.ok(lastRequest.url.includes("destination_currency_type=crypto"));
  });

  it("get-fee-profiles sends GET", async () => {
    await startServer({ profiles: [] });
    await runAction({ command: "get-fee-profiles" });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/fee-profiles");
  });

  it("get-terms sends GET with country", async () => {
    await startServer({ terms: "..." });
    await runAction({ command: "get-terms", "country-code": "US" });
    assert.equal(lastRequest.method, "GET");
    assert.ok(lastRequest.url.includes("country=US"));
  });

  it("get-country-subdivisions sends GET", async () => {
    await startServer([{ code: "CA" }]);
    await runAction({
      command: "get-country-subdivisions",
      "country-code": "US",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/country_subdivisions/US");
  });

  it("get-microdeposits sends GET", async () => {
    await startServer({ deposits: [] });
    await runAction({
      command: "get-microdeposits",
      "customer-id": "cust_1",
    });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/customers/cust_1/microdeposits");
  });
});

// ---------------------------------------------------------------------------
// Integration: Webhooks
// ---------------------------------------------------------------------------

describe("integration: webhooks", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("list-webhooks sends GET", async () => {
    await startServer({ items: [] });
    await runAction({ command: "list-webhooks" });
    assert.equal(lastRequest.method, "GET");
    assert.equal(lastRequest.url, "/api/webhooks");
  });

  it("update-webhook sends PATCH with body", async () => {
    await startServer({ id: "wh_1" });
    const body = JSON.stringify({ url: "https://example.com/hook" });
    await runAction({
      command: "update-webhook",
      "webhook-id": "wh_1",
      body,
    });
    assert.equal(lastRequest.method, "PATCH");
    assert.equal(lastRequest.url, "/api/webhooks/wh_1");
  });

  it("ping-webhook sends POST", async () => {
    await startServer({ ok: true });
    await runAction({ command: "ping-webhook", "webhook-id": "wh_1" });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/webhooks/wh_1/ping");
  });
});

// ---------------------------------------------------------------------------
// Integration: Sandbox
// ---------------------------------------------------------------------------

describe("integration: sandbox", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("sandbox-reset sends POST", async () => {
    await startServer({ ok: true });
    await runAction({ command: "sandbox-reset" });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/sandbox/reset");
  });

  it("sandbox-mock-transaction sends POST with body", async () => {
    await startServer({ id: "tx_1" });
    const body = JSON.stringify({ autoramp_id: "ar_1", amount: 100 });
    await runAction({ command: "sandbox-mock-transaction", body });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/sandbox/transaction");
  });

  it("sandbox-update-autoramp sends PUT with status", async () => {
    await startServer({ id: "ar_1" });
    await runAction({
      command: "sandbox-update-autoramp",
      "autoramp-id": "ar_1",
      "sandbox-status": "completed",
    });
    assert.equal(lastRequest.method, "PUT");
    assert.equal(lastRequest.url, "/api/sandbox/autoramp/ar_1");
    const parsed = JSON.parse(lastRequest.body);
    assert.equal(parsed.status, "completed");
  });

  it("sandbox-update-fiat-verification sends PUT", async () => {
    await startServer({ id: "addr_1" });
    await runAction({
      command: "sandbox-update-fiat-verification",
      "address-id": "addr_1",
      "sandbox-status": "verified",
    });
    assert.equal(lastRequest.method, "PUT");
    assert.equal(lastRequest.url, "/api/sandbox/fiat-verification/addr_1");
    const parsed = JSON.parse(lastRequest.body);
    assert.equal(parsed.status, "verified");
  });

  it("sandbox-update-identification sends POST", async () => {
    await startServer({ id: "id_1" });
    await runAction({
      command: "sandbox-update-identification",
      "address-id": "id_1",
      "sandbox-status": "approved",
    });
    assert.equal(lastRequest.method, "POST");
    assert.equal(lastRequest.url, "/api/sandbox/identification/id_1");
    const parsed = JSON.parse(lastRequest.body);
    assert.equal(parsed.status, "approved");
  });

  it("sandbox-update-transaction sends PUT", async () => {
    await startServer({ id: "tx_1" });
    await runAction({
      command: "sandbox-update-transaction",
      "address-id": "tx_1",
      "sandbox-status": "settled",
    });
    assert.equal(lastRequest.method, "PUT");
    assert.equal(lastRequest.url, "/api/sandbox/transaction/tx_1/state");
    const parsed = JSON.parse(lastRequest.body);
    assert.equal(parsed.state, "settled");
  });
});

// ---------------------------------------------------------------------------
// Integration: Error handling
// ---------------------------------------------------------------------------

describe("integration: error handling", () => {
  beforeEach(async () => {
    lastRequest = null;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("unknown command reports error", async () => {
    await startServer({});
    const result = await runAction({ command: "nonexistent-command" });
    assert.ok(
      result.stderr.includes("Unknown command") ||
        result.stdout.includes("Unknown command"),
    );
  });

  it("missing api-key reports error", async () => {
    await startServer({});
    const env = { ...process.env };
    env["INPUT_COMMAND"] = "list-cryptocurrencies";
    env["INPUT_API-URL"] = `http://127.0.0.1:${serverPort}`;
    // Deliberately omit INPUT_API-KEY
    delete env["INPUT_API-KEY"];
    try {
      await execFileAsync("node", ["dist/index.js"], {
        cwd: PROJECT_ROOT,
        env,
        timeout: 10000,
      });
      assert.fail("Should have failed");
    } catch (err) {
      assert.ok(
        err.stderr.includes("required") || err.stdout.includes("required"),
      );
    }
  });

  it("HTTP error from API is reported", async () => {
    await startServer({ error: "Not found" }, 404);
    const result = await runAction({
      command: "get-autoramp",
      "autoramp-id": "nonexistent",
    });
    assert.ok(result.stderr.includes("404") || result.stdout.includes("404"));
  });
});
