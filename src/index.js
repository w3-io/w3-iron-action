const core = require("@actions/core");

async function run() {
  try {
    const command = core.getInput("command", { required: true }).toLowerCase();
    const apiKey = core.getInput("api-key", { required: true });
    const apiUrlRaw = core.getInput("api-url") || "https://api.iron.xyz";
    // Ensure /api suffix is present
    const apiUrl = apiUrlRaw.endsWith("/api")
      ? apiUrlRaw
      : `${apiUrlRaw.replace(/\/+$/, "")}/api`;

    // Common inputs
    const customerId = core.getInput("customer-id") || "";
    const autorampId = core.getInput("autoramp-id") || "";
    const externalId = core.getInput("external-id") || "";
    const addressId = core.getInput("address-id") || "";
    const body = core.getInput("body") || "";
    const limit = core.getInput("limit") || "";
    const offset = core.getInput("offset") || "";
    const status = core.getInput("status") || "";
    const idempotencyKey = core.getInput("idempotency-key") || "";

    // Quote inputs
    const sourceCurrency = core.getInput("source-currency") || "";
    const destinationCurrency = core.getInput("destination-currency") || "";
    const sourceAmount = core.getInput("source-amount") || "";
    const destinationAmount = core.getInput("destination-amount") || "";
    const side = core.getInput("side") || "";

    // Exchange rate inputs
    const baseCurrency = core.getInput("base-currency") || "";
    const quoteCurrency = core.getInput("quote-currency") || "";

    // Transaction inputs
    const transactionIds = core.getInput("transaction-ids") || "";

    // Sandbox inputs
    const sandboxStatus = core.getInput("sandbox-status") || "";

    // Webhook inputs
    const webhookId = core.getInput("webhook-id") || "";

    // Chain inputs
    const sourceChain = core.getInput("source-chain") || "";
    const destinationChain = core.getInput("destination-chain") || "";

    // Address inputs
    const countryCode = core.getInput("country-code") || "";
    const vaspQuery = core.getInput("vasp-query") || "";
    const paymentId = core.getInput("payment-id") || "";

    const headers = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    // Auto-generate idempotency key for write operations if not provided
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

    async function request(method, path, bodyObj) {
      const url = `${apiUrl}${path}`;
      const opts = { method, headers };
      if (bodyObj && (method === "POST" || method === "PUT" || method === "PATCH")) {
        opts.body = JSON.stringify(bodyObj);
      }
      const res = await fetch(url, opts);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      if (!res.ok) {
        const msg = typeof data === "object" ? JSON.stringify(data) : data;
        throw new Error(`${method} ${path} returned ${res.status}: ${msg}`);
      }
      return data;
    }

    function queryString(params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      return qs ? `?${qs}` : "";
    }

    function parseBody() {
      if (!body) throw new Error("body input is required for this command");
      return JSON.parse(body);
    }

    let result;

    switch (command) {
      // -----------------------------------------------------------------
      // Autoramps
      // -----------------------------------------------------------------

      case "create-autoramp": {
        result = await request("POST", "/autoramps", parseBody());
        break;
      }

      case "get-autoramp": {
        if (!autorampId) throw new Error("autoramp-id is required");
        result = await request("GET", `/autoramps/${autorampId}`);
        break;
      }

      case "get-autoramp-by-external-id": {
        if (!externalId) throw new Error("external-id is required");
        result = await request("GET", `/autoramps/${externalId}/external`);
        break;
      }

      case "list-autoramps": {
        const qs = queryString({
          customer_id: customerId,
          limit,
          offset,
          status,
        });
        result = await request("GET", `/autoramps${qs}`);
        break;
      }

      case "cancel-autoramp": {
        if (!autorampId) throw new Error("autoramp-id is required");
        result = await request("DELETE", `/autoramps/${autorampId}`);
        break;
      }

      case "patch-autoramp": {
        if (!autorampId) throw new Error("autoramp-id is required");
        result = await request("PATCH", `/autoramps/${autorampId}`, parseBody());
        break;
      }

      case "get-quote": {
        const qs = queryString({
          customer_id: customerId,
          source_currency: sourceCurrency,
          destination_currency: destinationCurrency,
          source_amount: sourceAmount,
          destination_amount: destinationAmount,
          side,
        });
        result = await request("GET", `/autoramps/quote${qs}`);
        break;
      }

      case "check-limit": {
        const qs = queryString({ customer_id: customerId });
        result = await request("GET", `/autoramps/check-limit${qs}`);
        break;
      }

      case "retry-autoramp-auth": {
        if (!autorampId) throw new Error("autoramp-id is required");
        result = await request("POST", `/autoramps/${autorampId}/retry-auth`);
        break;
      }

      case "create-open-banking-payment": {
        if (!autorampId) throw new Error("autoramp-id is required");
        result = await request(
          "POST",
          `/autoramps/${autorampId}/payments/open-banking`,
          body ? parseBody() : {},
        );
        break;
      }

      case "get-open-banking-payment": {
        if (!paymentId) throw new Error("payment-id is required");
        result = await request(
          "GET",
          `/autoramps/payments/open-banking/${paymentId}`,
        );
        break;
      }

      // -----------------------------------------------------------------
      // Transactions
      // -----------------------------------------------------------------

      case "list-transactions": {
        const qs = queryString({
          customer_id: customerId,
          autoramp_id: autorampId,
          limit,
          offset,
          status,
        });
        result = await request("GET", `/autoramp-transactions${qs}`);
        break;
      }

      case "get-transactions-by-ids": {
        if (!transactionIds) throw new Error("transaction-ids is required");
        const qs = queryString({ ids: transactionIds });
        result = await request("GET", `/autoramp-transactions/ids${qs}`);
        break;
      }

      // -----------------------------------------------------------------
      // Customers
      // -----------------------------------------------------------------

      case "create-customer": {
        result = await request("POST", "/customers", parseBody());
        break;
      }

      case "get-customer": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request("GET", `/customers/${customerId}`);
        break;
      }

      case "get-customer-by-external-id": {
        if (!externalId) throw new Error("external-id is required");
        result = await request("GET", `/customers/${externalId}/external`);
        break;
      }

      case "update-customer": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request("PUT", `/customers/${customerId}`, parseBody());
        break;
      }

      case "list-customers": {
        const qs = queryString({ limit, offset });
        result = await request("GET", `/customers${qs}`);
        break;
      }

      case "get-customer-abilities": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request("GET", `/customers/${customerId}/abilities`);
        break;
      }

      // -----------------------------------------------------------------
      // KYC / Identifications
      // -----------------------------------------------------------------

      case "create-identification": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request(
          "POST",
          `/customers/${customerId}/identifications/v2`,
          body ? parseBody() : {},
        );
        break;
      }

      case "get-identification": {
        if (!addressId) throw new Error("address-id is required (identification ID)");
        result = await request("GET", `/identifications/${addressId}`);
        break;
      }

      case "list-identifications": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request(
          "GET",
          `/customers/${customerId}/identifications`,
        );
        break;
      }

      case "get-compliance-questionnaire": {
        if (!addressId) throw new Error("address-id is required (identification ID)");
        result = await request(
          "GET",
          `/identifications/${addressId}/compliance-questionnaire`,
        );
        break;
      }

      // -----------------------------------------------------------------
      // Signings
      // -----------------------------------------------------------------

      case "create-signing": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request(
          "POST",
          `/customers/${customerId}/signings`,
          parseBody(),
        );
        break;
      }

      case "list-signings": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request("GET", `/customers/${customerId}/signings`);
        break;
      }

      case "get-required-signings": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request(
          "GET",
          `/customers/${customerId}/required-signings`,
        );
        break;
      }

      // -----------------------------------------------------------------
      // Crypto Addresses
      // -----------------------------------------------------------------

      case "register-hosted-wallet": {
        result = await request(
          "POST",
          "/addresses/crypto/hosted",
          parseBody(),
        );
        break;
      }

      case "register-selfhosted-wallet": {
        result = await request(
          "POST",
          "/addresses/crypto/selfhosted",
          parseBody(),
        );
        break;
      }

      case "list-crypto-addresses": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request(
          "GET",
          `/addresses/crypto/${customerId}`,
        );
        break;
      }

      case "disable-crypto-address": {
        if (!addressId) throw new Error("address-id is required");
        result = await request(
          "PUT",
          `/addresses/crypto/${addressId}/disabled`,
          parseBody(),
        );
        break;
      }

      case "search-vasps": {
        const qs = queryString({ query: vaspQuery });
        result = await request(
          "GET",
          `/addresses/crypto/hosted/vasps${qs}`,
        );
        break;
      }

      // -----------------------------------------------------------------
      // Fiat Addresses (Bank Accounts)
      // -----------------------------------------------------------------

      case "register-bank-account": {
        result = await request("POST", "/addresses/fiat", parseBody());
        break;
      }

      case "list-bank-accounts": {
        if (customerId) {
          result = await request("GET", `/addresses/fiat/${customerId}`);
        } else {
          const qs = queryString({ limit, offset, status });
          result = await request("GET", `/addresses/fiat${qs}`);
        }
        break;
      }

      case "get-bank-account": {
        if (!customerId) throw new Error("customer-id is required");
        if (!addressId) throw new Error("address-id is required");
        result = await request(
          "GET",
          `/addresses/fiat/${customerId}/${addressId}`,
        );
        break;
      }

      case "delete-bank-account": {
        if (!customerId) throw new Error("customer-id is required");
        if (!addressId) throw new Error("address-id is required");
        result = await request(
          "DELETE",
          `/addresses/fiat/${customerId}/${addressId}`,
        );
        break;
      }

      case "retry-bank-auth": {
        if (!addressId) throw new Error("address-id is required");
        result = await request(
          "POST",
          `/addresses/fiat/${addressId}/retry-auth`,
        );
        break;
      }

      // -----------------------------------------------------------------
      // Authentication Codes
      // -----------------------------------------------------------------

      case "get-auth-code": {
        if (!addressId) throw new Error("address-id is required (entity ID)");
        result = await request(
          "GET",
          `/authentication-codes/entity/${addressId}`,
        );
        break;
      }

      case "submit-auth-code": {
        if (!addressId) throw new Error("address-id is required (auth code ID)");
        result = await request(
          "PUT",
          `/authentication-codes/${addressId}`,
          parseBody(),
        );
        break;
      }

      // -----------------------------------------------------------------
      // Microdeposits
      // -----------------------------------------------------------------

      case "get-microdeposits": {
        if (!customerId) throw new Error("customer-id is required");
        result = await request(
          "GET",
          `/customers/${customerId}/microdeposits`,
        );
        break;
      }

      // -----------------------------------------------------------------
      // Reference Data
      // -----------------------------------------------------------------

      case "list-cryptocurrencies": {
        result = await request("GET", "/cryptocurrencies");
        break;
      }

      case "list-fiat-currencies": {
        result = await request("GET", "/fiatcurrencies");
        break;
      }

      case "get-exchange-rate": {
        // Infer currency types: fiat currencies are 3-letter ISO (USD, EUR, GBP)
        const src = sourceCurrency || baseCurrency;
        const dst = destinationCurrency || quoteCurrency;
        const fiatCodes = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "CNY", "HKD", "SGD"];
        const srcType = fiatCodes.includes(src.toUpperCase()) ? "fiat" : "crypto";
        const dstType = fiatCodes.includes(dst.toUpperCase()) ? "fiat" : "crypto";
        const qs = queryString({
          source_currency_code: src,
          source_currency_type: srcType,
          destination_currency_code: dst,
          destination_currency_type: dstType,
          source_currency_chain: srcType === "crypto" ? (sourceChain || "Ethereum") : "",
          destination_currency_chain: dstType === "crypto" ? (destinationChain || "Ethereum") : "",
          amount: sourceAmount,
        });
        result = await request("GET", `/exchange-rate${qs}`);
        break;
      }

      case "get-fee-profiles": {
        result = await request("GET", "/fee-profiles");
        break;
      }

      case "get-terms": {
        const qs = queryString({ country: countryCode });
        result = await request("GET", `/terms-and-conditions${qs}`);
        break;
      }

      case "get-country-subdivisions": {
        if (!countryCode) throw new Error("country-code is required");
        result = await request(
          "GET",
          `/country_subdivisions/${countryCode}`,
        );
        break;
      }

      // -----------------------------------------------------------------
      // Webhooks
      // -----------------------------------------------------------------

      case "list-webhooks": {
        result = await request("GET", "/webhooks");
        break;
      }

      case "update-webhook": {
        if (!webhookId) throw new Error("webhook-id is required");
        result = await request(
          "PATCH",
          `/webhooks/${webhookId}`,
          parseBody(),
        );
        break;
      }

      case "ping-webhook": {
        if (!webhookId) throw new Error("webhook-id is required");
        result = await request("POST", `/webhooks/${webhookId}/ping`);
        break;
      }

      // -----------------------------------------------------------------
      // Sandbox
      // -----------------------------------------------------------------

      case "sandbox-reset": {
        result = await request("POST", "/sandbox/reset");
        break;
      }

      case "sandbox-mock-transaction": {
        result = await request("POST", "/sandbox/transaction", parseBody());
        break;
      }

      case "sandbox-update-autoramp": {
        if (!autorampId) throw new Error("autoramp-id is required");
        result = await request(
          "PUT",
          `/sandbox/autoramp/${autorampId}`,
          { status: sandboxStatus || parseBody().status },
        );
        break;
      }

      case "sandbox-update-fiat-verification": {
        if (!addressId) throw new Error("address-id is required");
        result = await request(
          "PUT",
          `/sandbox/fiat-verification/${addressId}`,
          { status: sandboxStatus || parseBody().status },
        );
        break;
      }

      case "sandbox-update-identification": {
        if (!addressId) throw new Error("address-id is required (identification ID)");
        result = await request(
          "POST",
          `/sandbox/identification/${addressId}`,
          { status: sandboxStatus || parseBody().status },
        );
        break;
      }

      case "sandbox-update-transaction": {
        if (!addressId) throw new Error("address-id is required (transaction ID)");
        result = await request(
          "PUT",
          `/sandbox/transaction/${addressId}/state`,
          { state: sandboxStatus || parseBody().state },
        );
        break;
      }

      default:
        throw new Error(
          `Unknown command: ${command}. Available: ` +
            "create-autoramp, get-autoramp, get-autoramp-by-external-id, list-autoramps, cancel-autoramp, patch-autoramp, get-quote, check-limit, retry-autoramp-auth, create-open-banking-payment, get-open-banking-payment, " +
            "list-transactions, get-transactions-by-ids, " +
            "create-customer, get-customer, get-customer-by-external-id, update-customer, list-customers, get-customer-abilities, " +
            "create-identification, get-identification, list-identifications, get-compliance-questionnaire, " +
            "create-signing, list-signings, get-required-signings, " +
            "register-hosted-wallet, register-selfhosted-wallet, list-crypto-addresses, disable-crypto-address, search-vasps, " +
            "register-bank-account, list-bank-accounts, get-bank-account, delete-bank-account, retry-bank-auth, " +
            "get-auth-code, submit-auth-code, get-microdeposits, " +
            "list-cryptocurrencies, list-fiat-currencies, get-exchange-rate, get-fee-profiles, get-terms, get-country-subdivisions, " +
            "list-webhooks, update-webhook, ping-webhook, " +
            "sandbox-reset, sandbox-mock-transaction, sandbox-update-autoramp, sandbox-update-fiat-verification, sandbox-update-identification, sandbox-update-transaction",
        );
    }

    core.setOutput("result", JSON.stringify(result));
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
