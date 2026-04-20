import {
  createCommandRouter,
  setJsonOutput,
  W3ActionError,
} from "@w3-io/action-core";
import * as core from "@actions/core";

// -- Shared helpers -----------------------------------------------------------

export function getApiUrl() {
  const raw = core.getInput("api-url") || "https://api.iron.xyz";
  return raw.endsWith("/api") ? raw : `${raw.replace(/\/+$/, "")}/api`;
}

export function buildHeaders(apiKey, command) {
  const idempotencyKey = core.getInput("idempotency-key") || "";
  const headers = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (idempotencyKey) {
    headers["IDEMPOTENCY-KEY"] = idempotencyKey;
  } else if (
    command.startsWith("create-") ||
    command.startsWith("register-") ||
    command.startsWith("update-") ||
    command === "cancel-autoramp" ||
    command === "patch-autoramp" ||
    command.startsWith("sandbox-")
  ) {
    headers["IDEMPOTENCY-KEY"] = crypto.randomUUID();
  }
  return headers;
}

export function makeRequest(apiUrl, headers) {
  return async function request(method, path, bodyObj) {
    const url = `${apiUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const opts = { method, headers, signal: controller.signal };
    if (
      bodyObj &&
      (method === "POST" || method === "PUT" || method === "PATCH")
    ) {
      opts.body = JSON.stringify(bodyObj);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new W3ActionError(
          "TIMEOUT",
          `${method} ${path} timed out after 30s`,
        );
      }
      throw new W3ActionError(
        "REQUEST_FAILED",
        `${method} ${path}: ${err.message}`,
      );
    }
    clearTimeout(timer);
    if (res.status === 204) {
      return null;
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = typeof data === "object" ? JSON.stringify(data) : data;
      throw new W3ActionError(
        "HTTP_ERROR",
        `${method} ${path} returned ${res.status}: ${msg}`,
        {
          statusCode: res.status,
          details: typeof data === "object" ? data : undefined,
        },
      );
    }
    return data;
  };
}

export function queryString(params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

export function parseBody() {
  const body = core.getInput("body") || "";
  if (!body)
    throw new W3ActionError(
      "MISSING_INPUT",
      "body input is required for this command",
    );
  return JSON.parse(body);
}

export function setup(command) {
  const apiKey = core.getInput("api-key", { required: true });
  const apiUrl = getApiUrl();
  const headers = buildHeaders(apiKey, command);
  const request = makeRequest(apiUrl, headers);
  return { request };
}

// -- Command handlers ---------------------------------------------------------

export function handler(command, fn) {
  return async () => {
    const { request } = setup(command);
    const result = await fn(request);
    setJsonOutput("result", result);
  };
}

export const COMMANDS = {
  // -----------------------------------------------------------------
  // Autoramps
  // -----------------------------------------------------------------

  "create-autoramp": handler("create-autoramp", async (request) => {
    return request("POST", "/autoramps", parseBody());
  }),

  "get-autoramp": handler("get-autoramp", async (request) => {
    const autorampId = core.getInput("autoramp-id") || "";
    if (!autorampId)
      throw new W3ActionError("MISSING_INPUT", "autoramp-id is required");
    return request("GET", `/autoramps/${autorampId}`);
  }),

  "get-autoramp-by-external-id": handler(
    "get-autoramp-by-external-id",
    async (request) => {
      const externalId = core.getInput("external-id") || "";
      if (!externalId)
        throw new W3ActionError("MISSING_INPUT", "external-id is required");
      return request("GET", `/autoramps/${externalId}/external`);
    },
  ),

  "list-autoramps": handler("list-autoramps", async (request) => {
    const qs = queryString({
      customer_id: core.getInput("customer-id") || "",
      limit: core.getInput("limit") || "",
      offset: core.getInput("offset") || "",
      status: core.getInput("status") || "",
    });
    return request("GET", `/autoramps${qs}`);
  }),

  "cancel-autoramp": handler("cancel-autoramp", async (request) => {
    const autorampId = core.getInput("autoramp-id") || "";
    if (!autorampId)
      throw new W3ActionError("MISSING_INPUT", "autoramp-id is required");
    return request("DELETE", `/autoramps/${autorampId}`);
  }),

  "patch-autoramp": handler("patch-autoramp", async (request) => {
    const autorampId = core.getInput("autoramp-id") || "";
    if (!autorampId)
      throw new W3ActionError("MISSING_INPUT", "autoramp-id is required");
    return request("PATCH", `/autoramps/${autorampId}`, parseBody());
  }),

  "get-quote": handler("get-quote", async (request) => {
    const qs = queryString({
      customer_id: core.getInput("customer-id") || "",
      source_currency: core.getInput("source-currency") || "",
      destination_currency: core.getInput("destination-currency") || "",
      source_amount: core.getInput("source-amount") || "",
      destination_amount: core.getInput("destination-amount") || "",
      side: core.getInput("side") || "",
    });
    return request("GET", `/autoramps/quote${qs}`);
  }),

  "check-limit": handler("check-limit", async (request) => {
    const qs = queryString({
      customer_id: core.getInput("customer-id") || "",
    });
    return request("GET", `/autoramps/check-limit${qs}`);
  }),

  "retry-autoramp-auth": handler("retry-autoramp-auth", async (request) => {
    const autorampId = core.getInput("autoramp-id") || "";
    if (!autorampId)
      throw new W3ActionError("MISSING_INPUT", "autoramp-id is required");
    return request("POST", `/autoramps/${autorampId}/retry-auth`);
  }),

  "create-open-banking-payment": handler(
    "create-open-banking-payment",
    async (request) => {
      const autorampId = core.getInput("autoramp-id") || "";
      const body = core.getInput("body") || "";
      if (!autorampId)
        throw new W3ActionError("MISSING_INPUT", "autoramp-id is required");
      return request(
        "POST",
        `/autoramps/${autorampId}/payments/open-banking`,
        body ? JSON.parse(body) : {},
      );
    },
  ),

  "get-open-banking-payment": handler(
    "get-open-banking-payment",
    async (request) => {
      const paymentId = core.getInput("payment-id") || "";
      if (!paymentId)
        throw new W3ActionError("MISSING_INPUT", "payment-id is required");
      return request("GET", `/autoramps/payments/open-banking/${paymentId}`);
    },
  ),

  // -----------------------------------------------------------------
  // Transactions
  // -----------------------------------------------------------------

  "list-transactions": handler("list-transactions", async (request) => {
    const qs = queryString({
      customer_id: core.getInput("customer-id") || "",
      autoramp_id: core.getInput("autoramp-id") || "",
      limit: core.getInput("limit") || "",
      offset: core.getInput("offset") || "",
      status: core.getInput("status") || "",
    });
    return request("GET", `/autoramp-transactions${qs}`);
  }),

  "get-transactions-by-ids": handler(
    "get-transactions-by-ids",
    async (request) => {
      const transactionIds = core.getInput("transaction-ids") || "";
      if (!transactionIds)
        throw new W3ActionError("MISSING_INPUT", "transaction-ids is required");
      const qs = queryString({ ids: transactionIds });
      return request("GET", `/autoramp-transactions/ids${qs}`);
    },
  ),

  // -----------------------------------------------------------------
  // Customers
  // -----------------------------------------------------------------

  "create-customer": handler("create-customer", async (request) => {
    return request("POST", "/customers", parseBody());
  }),

  "get-customer": handler("get-customer", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("GET", `/customers/${customerId}`);
  }),

  "get-customer-by-external-id": handler(
    "get-customer-by-external-id",
    async (request) => {
      const externalId = core.getInput("external-id") || "";
      if (!externalId)
        throw new W3ActionError("MISSING_INPUT", "external-id is required");
      return request("GET", `/customers/${externalId}/external`);
    },
  ),

  "update-customer": handler("update-customer", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("PUT", `/customers/${customerId}`, parseBody());
  }),

  "list-customers": handler("list-customers", async (request) => {
    const qs = queryString({
      limit: core.getInput("limit") || "",
      offset: core.getInput("offset") || "",
    });
    return request("GET", `/customers${qs}`);
  }),

  "get-customer-abilities": handler(
    "get-customer-abilities",
    async (request) => {
      const customerId = core.getInput("customer-id") || "";
      if (!customerId)
        throw new W3ActionError("MISSING_INPUT", "customer-id is required");
      return request("GET", `/customers/${customerId}/abilities`);
    },
  ),

  // -----------------------------------------------------------------
  // KYC / Identifications
  // -----------------------------------------------------------------

  "create-identification": handler("create-identification", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    const body = core.getInput("body") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request(
      "POST",
      `/customers/${customerId}/identifications/v2`,
      body ? JSON.parse(body) : {},
    );
  }),

  "get-identification": handler("get-identification", async (request) => {
    const addressId = core.getInput("address-id") || "";
    if (!addressId)
      throw new W3ActionError(
        "MISSING_INPUT",
        "address-id is required (identification ID)",
      );
    return request("GET", `/identifications/${addressId}`);
  }),

  "list-identifications": handler("list-identifications", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("GET", `/customers/${customerId}/identifications`);
  }),

  "get-compliance-questionnaire": handler(
    "get-compliance-questionnaire",
    async (request) => {
      const addressId = core.getInput("address-id") || "";
      if (!addressId)
        throw new W3ActionError(
          "MISSING_INPUT",
          "address-id is required (identification ID)",
        );
      return request(
        "GET",
        `/identifications/${addressId}/compliance-questionnaire`,
      );
    },
  ),

  // -----------------------------------------------------------------
  // Signings
  // -----------------------------------------------------------------

  "create-signing": handler("create-signing", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("POST", `/customers/${customerId}/signings`, parseBody());
  }),

  "list-signings": handler("list-signings", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("GET", `/customers/${customerId}/signings`);
  }),

  "get-required-signings": handler("get-required-signings", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("GET", `/customers/${customerId}/required-signings`);
  }),

  // -----------------------------------------------------------------
  // Crypto Addresses
  // -----------------------------------------------------------------

  "register-hosted-wallet": handler(
    "register-hosted-wallet",
    async (request) => {
      return request("POST", "/addresses/crypto/hosted", parseBody());
    },
  ),

  "register-selfhosted-wallet": handler(
    "register-selfhosted-wallet",
    async (request) => {
      return request("POST", "/addresses/crypto/selfhosted", parseBody());
    },
  ),

  "list-crypto-addresses": handler("list-crypto-addresses", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("GET", `/addresses/crypto/${customerId}`);
  }),

  "disable-crypto-address": handler(
    "disable-crypto-address",
    async (request) => {
      const addressId = core.getInput("address-id") || "";
      if (!addressId)
        throw new W3ActionError("MISSING_INPUT", "address-id is required");
      return request(
        "PUT",
        `/addresses/crypto/${addressId}/disabled`,
        parseBody(),
      );
    },
  ),

  "search-vasps": handler("search-vasps", async (request) => {
    const qs = queryString({ query: core.getInput("vasp-query") || "" });
    return request("GET", `/addresses/crypto/hosted/vasps${qs}`);
  }),

  // -----------------------------------------------------------------
  // Fiat Addresses (Bank Accounts)
  // -----------------------------------------------------------------

  "register-bank-account": handler("register-bank-account", async (request) => {
    return request("POST", "/addresses/fiat", parseBody());
  }),

  "list-bank-accounts": handler("list-bank-accounts", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (customerId) {
      return request("GET", `/addresses/fiat/${customerId}`);
    }
    const qs = queryString({
      limit: core.getInput("limit") || "",
      offset: core.getInput("offset") || "",
      status: core.getInput("status") || "",
    });
    return request("GET", `/addresses/fiat${qs}`);
  }),

  "get-bank-account": handler("get-bank-account", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    const addressId = core.getInput("address-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    if (!addressId)
      throw new W3ActionError("MISSING_INPUT", "address-id is required");
    return request("GET", `/addresses/fiat/${customerId}/${addressId}`);
  }),

  "delete-bank-account": handler("delete-bank-account", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    const addressId = core.getInput("address-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    if (!addressId)
      throw new W3ActionError("MISSING_INPUT", "address-id is required");
    return request("DELETE", `/addresses/fiat/${customerId}/${addressId}`);
  }),

  "retry-bank-auth": handler("retry-bank-auth", async (request) => {
    const addressId = core.getInput("address-id") || "";
    if (!addressId)
      throw new W3ActionError("MISSING_INPUT", "address-id is required");
    return request("POST", `/addresses/fiat/${addressId}/retry-auth`);
  }),

  // -----------------------------------------------------------------
  // Authentication Codes
  // -----------------------------------------------------------------

  "get-auth-code": handler("get-auth-code", async (request) => {
    const addressId = core.getInput("address-id") || "";
    if (!addressId)
      throw new W3ActionError(
        "MISSING_INPUT",
        "address-id is required (entity ID)",
      );
    return request("GET", `/authentication-codes/entity/${addressId}`);
  }),

  "submit-auth-code": handler("submit-auth-code", async (request) => {
    const addressId = core.getInput("address-id") || "";
    if (!addressId)
      throw new W3ActionError(
        "MISSING_INPUT",
        "address-id is required (auth code ID)",
      );
    return request("PUT", `/authentication-codes/${addressId}`, parseBody());
  }),

  // -----------------------------------------------------------------
  // Microdeposits
  // -----------------------------------------------------------------

  "get-microdeposits": handler("get-microdeposits", async (request) => {
    const customerId = core.getInput("customer-id") || "";
    if (!customerId)
      throw new W3ActionError("MISSING_INPUT", "customer-id is required");
    return request("GET", `/customers/${customerId}/microdeposits`);
  }),

  // -----------------------------------------------------------------
  // Reference Data
  // -----------------------------------------------------------------

  "list-cryptocurrencies": handler("list-cryptocurrencies", async (request) => {
    return request("GET", "/cryptocurrencies");
  }),

  "list-fiat-currencies": handler("list-fiat-currencies", async (request) => {
    return request("GET", "/fiatcurrencies");
  }),

  "get-exchange-rate": handler("get-exchange-rate", async (request) => {
    const sourceCurrency = core.getInput("source-currency") || "";
    const destinationCurrency = core.getInput("destination-currency") || "";
    const baseCurrency = core.getInput("base-currency") || "";
    const quoteCurrency = core.getInput("quote-currency") || "";
    const sourceChain = core.getInput("source-chain") || "";
    const destinationChain = core.getInput("destination-chain") || "";
    const sourceAmount = core.getInput("source-amount") || "";

    const src = sourceCurrency || baseCurrency;
    const dst = destinationCurrency || quoteCurrency;
    const fiatCodes = [
      "USD",
      "EUR",
      "GBP",
      "CHF",
      "CAD",
      "AUD",
      "JPY",
      "CNY",
      "HKD",
      "SGD",
    ];
    const srcType = fiatCodes.includes(src.toUpperCase()) ? "fiat" : "crypto";
    const dstType = fiatCodes.includes(dst.toUpperCase()) ? "fiat" : "crypto";
    const qs = queryString({
      source_currency_code: src,
      source_currency_type: srcType,
      destination_currency_code: dst,
      destination_currency_type: dstType,
      source_currency_chain:
        srcType === "crypto" ? sourceChain || "Ethereum" : "",
      destination_currency_chain:
        dstType === "crypto" ? destinationChain || "Ethereum" : "",
      amount: sourceAmount,
    });
    return request("GET", `/exchange-rate${qs}`);
  }),

  "get-fee-profiles": handler("get-fee-profiles", async (request) => {
    return request("GET", "/fee-profiles");
  }),

  "get-terms": handler("get-terms", async (request) => {
    const qs = queryString({ country: core.getInput("country-code") || "" });
    return request("GET", `/terms-and-conditions${qs}`);
  }),

  "get-country-subdivisions": handler(
    "get-country-subdivisions",
    async (request) => {
      const countryCode = core.getInput("country-code") || "";
      if (!countryCode)
        throw new W3ActionError("MISSING_INPUT", "country-code is required");
      return request("GET", `/country_subdivisions/${countryCode}`);
    },
  ),

  // -----------------------------------------------------------------
  // Webhooks
  // -----------------------------------------------------------------

  "list-webhooks": handler("list-webhooks", async (request) => {
    return request("GET", "/webhooks");
  }),

  "update-webhook": handler("update-webhook", async (request) => {
    const webhookId = core.getInput("webhook-id") || "";
    if (!webhookId)
      throw new W3ActionError("MISSING_INPUT", "webhook-id is required");
    return request("PATCH", `/webhooks/${webhookId}`, parseBody());
  }),

  "ping-webhook": handler("ping-webhook", async (request) => {
    const webhookId = core.getInput("webhook-id") || "";
    if (!webhookId)
      throw new W3ActionError("MISSING_INPUT", "webhook-id is required");
    return request("POST", `/webhooks/${webhookId}/ping`);
  }),

  // -----------------------------------------------------------------
  // Sandbox
  // -----------------------------------------------------------------

  "sandbox-reset": handler("sandbox-reset", async (request) => {
    return request("POST", "/sandbox/reset");
  }),

  "sandbox-mock-transaction": handler(
    "sandbox-mock-transaction",
    async (request) => {
      return request("POST", "/sandbox/transaction", parseBody());
    },
  ),

  "sandbox-update-autoramp": handler(
    "sandbox-update-autoramp",
    async (request) => {
      const autorampId = core.getInput("autoramp-id") || "";
      const sandboxStatus = core.getInput("sandbox-status") || "";
      if (!autorampId)
        throw new W3ActionError("MISSING_INPUT", "autoramp-id is required");
      return request("PUT", `/sandbox/autoramp/${autorampId}`, {
        status: sandboxStatus || parseBody().status,
      });
    },
  ),

  "sandbox-update-fiat-verification": handler(
    "sandbox-update-fiat-verification",
    async (request) => {
      const addressId = core.getInput("address-id") || "";
      const sandboxStatus = core.getInput("sandbox-status") || "";
      if (!addressId)
        throw new W3ActionError("MISSING_INPUT", "address-id is required");
      return request("PUT", `/sandbox/fiat-verification/${addressId}`, {
        status: sandboxStatus || parseBody().status,
      });
    },
  ),

  "sandbox-update-identification": handler(
    "sandbox-update-identification",
    async (request) => {
      const addressId = core.getInput("address-id") || "";
      const sandboxStatus = core.getInput("sandbox-status") || "";
      if (!addressId)
        throw new W3ActionError(
          "MISSING_INPUT",
          "address-id is required (identification ID)",
        );
      return request("POST", `/sandbox/identification/${addressId}`, {
        status: sandboxStatus || parseBody().status,
      });
    },
  ),

  "sandbox-update-transaction": handler(
    "sandbox-update-transaction",
    async (request) => {
      const addressId = core.getInput("address-id") || "";
      const sandboxStatus = core.getInput("sandbox-status") || "";
      if (!addressId)
        throw new W3ActionError(
          "MISSING_INPUT",
          "address-id is required (transaction ID)",
        );
      return request("PUT", `/sandbox/transaction/${addressId}/state`, {
        state: sandboxStatus || parseBody().state,
      });
    },
  ),
};

export function createRouter() {
  return createCommandRouter(COMMANDS);
}
