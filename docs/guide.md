---
title: Iron
category: integrations
actions:
  [
    create-autoramp,
    get-autoramp,
    get-autoramp-by-external-id,
    list-autoramps,
    cancel-autoramp,
    patch-autoramp,
    get-quote,
    check-limit,
    retry-autoramp-auth,
    create-open-banking-payment,
    get-open-banking-payment,
    list-transactions,
    get-transactions-by-ids,
    create-customer,
    get-customer,
    get-customer-by-external-id,
    update-customer,
    list-customers,
    get-customer-abilities,
    create-identification,
    get-identification,
    list-identifications,
    get-compliance-questionnaire,
    create-signing,
    list-signings,
    get-required-signings,
    register-hosted-wallet,
    register-selfhosted-wallet,
    list-crypto-addresses,
    disable-crypto-address,
    search-vasps,
    register-bank-account,
    list-bank-accounts,
    get-bank-account,
    delete-bank-account,
    retry-bank-auth,
    get-auth-code,
    submit-auth-code,
    get-microdeposits,
    list-cryptocurrencies,
    list-fiat-currencies,
    get-exchange-rate,
    get-fee-profiles,
    get-terms,
    get-country-subdivisions,
    list-webhooks,
    update-webhook,
    ping-webhook,
    sandbox-reset,
    sandbox-mock-transaction,
    sandbox-update-autoramp,
    sandbox-update-fiat-verification,
    sandbox-update-identification,
    sandbox-update-transaction,
  ]
complexity: advanced
---

# Iron

[Iron](https://iron.xyz) is a fiat-to-crypto on/off-ramp and swap
platform that handles ACH, SEPA, Wire, RTP, SWIFT, CHAPS, and FPS bank
rails, KYC/KYB verification, Travel Rule compliance (VASP registration),
and locked-rate currency conversion. Use this action to onboard
customers, verify identities, register bank accounts and crypto wallets,
get quotes, create autoramps (automated fiat-crypto conversions), and
manage the full lifecycle from your W3 workflows.

## Quick start

```yaml
- name: Get a quote
  id: quote
  uses: w3/iron@v1
  with:
    command: get-quote
    api-key: ${{ secrets.IRON_API_KEY }}
    customer-id: cust_123
    source-currency: USD
    destination-currency: USDC
    source-amount: '1000'

- name: Create autoramp
  uses: w3/iron@v1
  with:
    command: create-autoramp
    api-key: ${{ secrets.IRON_API_KEY }}
    body: |
      {
        "customer_id": "cust_123",
        "source_currency": "USD",
        "destination_currency": "USDC",
        "source_amount": "1000",
        "deposit_rail": "ach",
        "destination_address_id": "addr_456"
      }
```

## Autoramp commands

### create-autoramp

Create a new on-ramp, off-ramp, or swap autoramp.

| Input | Required | Description |
| ----------------- | -------- | ------------------------------------------- |
| `api-key` | yes | Iron API key |
| `body` | yes | JSON with customer_id, currencies, amount, deposit_rail, destination_address_id |
| `idempotency-key` | no | UUID for idempotent creation |

**Output (`result`):**

```json
{
  "id": "ar_abc123",
  "status": "pending",
  "customer_id": "cust_123",
  "source_currency": "USD",
  "destination_currency": "USDC",
  "source_amount": "1000.00"
}
```

### get-autoramp

| Input | Required | Description |
| -------------- | -------- | ------------ |
| `autoramp-id` | yes | Autoramp ID |

### get-autoramp-by-external-id

| Input | Required | Description |
| ------------- | -------- | ----------------------- |
| `external-id` | yes | Your external reference |

### list-autoramps

| Input | Required | Description |
| ------------- | -------- | ----------------------- |
| `customer-id` | no | Filter by customer |
| `status` | no | Filter by status |
| `limit` | no | Pagination limit |
| `offset` | no | Pagination offset |

**Output:** `[{id, status, source_currency, ...}, ...]`

### cancel-autoramp

| Input | Required | Description |
| -------------- | -------- | ----------- |
| `autoramp-id` | yes | Autoramp ID |

### patch-autoramp

Update an autoramp's market settings.

| Input | Required | Description |
| -------------- | -------- | ------------------------------- |
| `autoramp-id` | yes | Autoramp ID |
| `body` | yes | JSON with fields to update |

### get-quote

Get a locked-rate quote for an autoramp.

| Input | Required | Description |
| ---------------------- | -------- | -------------------------------------- |
| `customer-id` | yes | Customer ID |
| `source-currency` | yes | Source currency (e.g. USD) |
| `destination-currency` | yes | Destination currency (e.g. USDC) |
| `source-amount` | no | Amount in source (provide one amount) |
| `destination-amount` | no | Amount in destination |
| `side` | no | Which amount is fixed |

**Output (`result`):**

```json
{
  "rate": "0.9998",
  "source_amount": "1000.00",
  "destination_amount": "999.80",
  "fee": "0.20",
  "expires_at": "2024-01-15T10:35:00Z"
}
```

### check-limit

Check if a customer can create more autoramps.

| Input | Required | Description |
| ------------- | -------- | ----------- |
| `customer-id` | yes | Customer ID |

### retry-autoramp-auth

Retry authentication for a stuck autoramp.

| Input | Required | Description |
| -------------- | -------- | ----------- |
| `autoramp-id` | yes | Autoramp ID |

## Open banking commands

### create-open-banking-payment

| Input | Required | Description |
| ----------------- | -------- | -------------------------------- |
| `body` | yes | JSON with payment details |
| `idempotency-key` | no | UUID for idempotent creation |

### get-open-banking-payment

| Input | Required | Description |
| ------------ | -------- | ----------- |
| `payment-id` | yes | Payment ID |

## Transaction commands

### list-transactions

| Input | Required | Description |
| ------------- | -------- | ---------------------- |
| `customer-id` | no | Filter by customer |
| `status` | no | Filter by status |
| `limit` | no | Pagination limit |
| `offset` | no | Pagination offset |

### get-transactions-by-ids

| Input | Required | Description |
| ----------------- | -------- | -------------------------------- |
| `transaction-ids` | yes | Comma-separated transaction IDs |

## Customer commands

### create-customer

| Input | Required | Description |
| ----------------- | -------- | --------------------------------------------- |
| `body` | yes | JSON with customer details (person/business) |
| `idempotency-key` | no | UUID for idempotent creation |

**Output (`result`):**

```json
{
  "id": "cust_abc123",
  "type": "person",
  "status": "active",
  "external_id": "your-ref-123"
}
```

### get-customer

| Input | Required | Description |
| ------------- | -------- | ----------- |
| `customer-id` | yes | Customer ID |

### get-customer-by-external-id

| Input | Required | Description |
| ------------- | -------- | ----------------------- |
| `external-id` | yes | Your external reference |

### update-customer

| Input | Required | Description |
| ------------- | -------- | ------------------------------ |
| `customer-id` | yes | Customer ID |
| `body` | yes | JSON with fields to update |

### list-customers

| Input | Required | Description |
| -------- | -------- | ---------------- |
| `limit` | no | Pagination limit |
| `offset` | no | Pagination offset |

### get-customer-abilities

Get what operations a customer is currently able to perform.

| Input | Required | Description |
| ------------- | -------- | ----------- |
| `customer-id` | yes | Customer ID |

## KYC / Identification commands

### create-identification

Start KYC or KYB verification for a customer.

| Input | Required | Description |
| ------------- | -------- | ---------------------------------- |
| `customer-id` | yes | Customer ID |
| `body` | yes | JSON with identification details |

### get-identification

| Input | Required | Description |
| ------------ | -------- | ----------------- |
| `address-id` | yes | Identification ID |

### list-identifications

| Input | Required | Description |
| ------------- | -------- | ----------- |
| `customer-id` | yes | Customer ID |

### get-compliance-questionnaire

| Input | Required | Description |
| ------------ | -------- | ----------------- |
| `address-id` | yes | Identification ID |

## Signing commands

### create-signing

Create a customer signing (terms acceptance).

| Input | Required | Description |
| ------------- | -------- | ----------------------------- |
| `customer-id` | yes | Customer ID |
| `body` | yes | JSON with signing details |

### list-signings

| Input | Required | Description |
| ------------- | -------- | ----------- |
| `customer-id` | yes | Customer ID |

### get-required-signings

| Input | Required | Description |
| ------------- | -------- | ----------- |
| `customer-id` | yes | Customer ID |

## Crypto address commands

### register-hosted-wallet

Register a hosted (exchange) wallet address. Requires VASP information
for Travel Rule compliance.

| Input | Required | Description |
| ------------- | -------- | ---------------------------------------- |
| `customer-id` | yes | Customer ID |
| `body` | yes | JSON with address, chain, VASP details |

### register-selfhosted-wallet

Register a self-hosted (non-custodial) wallet address.

| Input | Required | Description |
| ------------- | -------- | --------------------------------- |
| `customer-id` | yes | Customer ID |
| `body` | yes | JSON with address, chain details |

### list-crypto-addresses

| Input | Required | Description |
| ------------- | -------- | ----------- |
| `customer-id` | yes | Customer ID |

### disable-crypto-address

| Input | Required | Description |
| ------------ | -------- | ----------- |
| `address-id` | yes | Address ID |

### search-vasps

Search hosted wallet providers (VASPs) for Travel Rule compliance.

| Input | Required | Description |
| ------------ | -------- | ------------------- |
| `vasp-query` | yes | VASP name to search |

## Bank account commands

### register-bank-account

Register a bank account (SEPA, ACH, Wire, RTP, SWIFT, CHAPS, FPS).

| Input | Required | Description |
| ------------- | -------- | ----------------------------------- |
| `customer-id` | yes | Customer ID |
| `body` | yes | JSON with bank account details |

### list-bank-accounts

| Input | Required | Description |
| ------------- | -------- | ---------------------- |
| `customer-id` | no | Filter by customer |

### get-bank-account

| Input | Required | Description |
| ------------ | -------- | --------------- |
| `address-id` | yes | Bank account ID |

### delete-bank-account

| Input | Required | Description |
| ------------ | -------- | --------------- |
| `address-id` | yes | Bank account ID |

### retry-bank-auth

Retry bank account authentication.

| Input | Required | Description |
| ------------ | -------- | --------------- |
| `address-id` | yes | Bank account ID |

## Bank account authentication commands

### get-auth-code

Get pending authentication code for an entity.

| Input | Required | Description |
| ------------ | -------- | ----------- |
| `address-id` | yes | Entity ID |

### submit-auth-code

| Input | Required | Description |
| ------------ | -------- | ----------- |
| `address-id` | yes | Entity ID |
| `body` | yes | JSON with auth code |

### get-microdeposits

Get microdeposit verification status for bank account verification.

| Input | Required | Description |
| ------------ | -------- | --------------- |
| `address-id` | yes | Bank account ID |

## Reference data commands

### list-cryptocurrencies

List all supported cryptocurrencies. No additional inputs required.

### list-fiat-currencies

List all supported fiat currencies. No additional inputs required.

### get-exchange-rate

| Input | Required | Description |
| ---------------- | -------- | ---------------------------------------- |
| `base-currency` | yes | Base currency (e.g. USD) |
| `quote-currency` | yes | Quote currency (e.g. USDC) |

**Output (`result`):**

```json
{
  "base": "USD",
  "quote": "USDC",
  "rate": "0.9998",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### get-fee-profiles

Get partner fee profiles. No additional inputs required.

### get-terms

Get current terms and conditions. No additional inputs required.

### get-country-subdivisions

| Input | Required | Description |
| -------------- | -------- | ---------------------- |
| `country-code` | yes | ISO country code (US) |

## Webhook commands

### list-webhooks

List all configured webhooks. No additional inputs required.

### update-webhook

| Input | Required | Description |
| ------------ | -------- | ----------------------------------- |
| `webhook-id` | yes | Webhook ID |
| `body` | yes | JSON with updated webhook config |

### ping-webhook

| Input | Required | Description |
| ------------ | -------- | ----------- |
| `webhook-id` | yes | Webhook ID |

## Sandbox commands

### sandbox-reset

Reset the sandbox environment. No additional inputs required.

### sandbox-mock-transaction

| Input | Required | Description |
| ------ | -------- | ------------------------------------ |
| `body` | yes | JSON with mock transaction details |

### sandbox-update-autoramp

| Input | Required | Description |
| ---------------- | -------- | ----------------------- |
| `autoramp-id` | yes | Autoramp ID |
| `sandbox-status` | yes | New status |

### sandbox-update-fiat-verification

| Input | Required | Description |
| ---------------- | -------- | ----------------------- |
| `address-id` | yes | Fiat verification ID |
| `sandbox-status` | yes | New status |

### sandbox-update-identification

| Input | Required | Description |
| ---------------- | -------- | ----------------------- |
| `address-id` | yes | Identification ID |
| `sandbox-status` | yes | New status |

### sandbox-update-transaction

| Input | Required | Description |
| ---------------- | -------- | ----------------------- |
| `address-id` | yes | Transaction ID |
| `sandbox-status` | yes | New status |

## All inputs

| Input | Required | Default | Description |
| ---------------------- | -------- | ---------------------- | -------------------------------------------------- |
| `command` | yes | | Operation to perform (48 commands) |
| `api-key` | yes | | Iron API key (`X-API-Key` header) |
| `api-url` | no | `https://api.iron.xyz` | API base URL (production or sandbox) |
| `customer-id` | no | | Customer ID |
| `autoramp-id` | no | | Autoramp ID |
| `external-id` | no | | External ID for cross-referencing with your system |
| `address-id` | no | | Address, identification, or entity ID |
| `body` | no | | Request body as JSON (for create/update) |
| `limit` | no | | Pagination limit |
| `offset` | no | | Pagination offset |
| `status` | no | | Status filter for list operations |
| `idempotency-key` | no | | UUID for idempotent write operations |
| `source-currency` | no | | Source currency for quotes (e.g. USD) |
| `destination-currency` | no | | Destination currency for quotes (e.g. USDC) |
| `source-amount` | no | | Amount in source currency |
| `destination-amount` | no | | Amount in destination currency |
| `side` | no | | Quote side (which amount is fixed) |
| `base-currency` | no | | Base currency for exchange rate |
| `quote-currency` | no | | Quote currency for exchange rate |
| `transaction-ids` | no | | Comma-separated transaction IDs |
| `sandbox-status` | no | | Status for sandbox update operations |
| `webhook-id` | no | | Webhook ID |
| `country-code` | no | | ISO country code |
| `vasp-query` | no | | VASP search query |
| `payment-id` | no | | Open banking payment ID |

## Authentication

Iron uses API key authentication via the `X-API-Key` header. Get your
API key from the Iron dashboard.

| Environment | URL |
| ----------- | ------------------------------------ |
| Production | `https://api.iron.xyz` (default) |
| Sandbox | `https://api.sandbox.iron.xyz` |

```yaml
with:
  api-key: ${{ secrets.IRON_API_KEY }}
  api-url: https://api.sandbox.iron.xyz  # for testing
```

## Full onboarding workflow example

Create a customer, verify their identity, register a bank account
and wallet, then create an autoramp to convert USD to USDC.

```yaml
- name: Create customer
  id: customer
  uses: w3/iron@v1
  with:
    command: create-customer
    api-key: ${{ secrets.IRON_API_KEY }}
    api-url: https://api.sandbox.iron.xyz
    body: |
      {
        "type": "person",
        "external_id": "user-789",
        "email": "alice@example.com",
        "first_name": "Alice",
        "last_name": "Smith"
      }

- name: Start KYC
  id: kyc
  uses: w3/iron@v1
  with:
    command: create-identification
    api-key: ${{ secrets.IRON_API_KEY }}
    api-url: https://api.sandbox.iron.xyz
    customer-id: ${{ fromJSON(steps.customer.outputs.result).id }}
    body: '{"type": "individual"}'

- name: Register wallet
  uses: w3/iron@v1
  with:
    command: register-selfhosted-wallet
    api-key: ${{ secrets.IRON_API_KEY }}
    api-url: https://api.sandbox.iron.xyz
    customer-id: ${{ fromJSON(steps.customer.outputs.result).id }}
    body: |
      {
        "address": "0x1234...abcd",
        "chain": "ethereum",
        "currency": "USDC"
      }

- name: Register bank account
  id: bank
  uses: w3/iron@v1
  with:
    command: register-bank-account
    api-key: ${{ secrets.IRON_API_KEY }}
    api-url: https://api.sandbox.iron.xyz
    customer-id: ${{ fromJSON(steps.customer.outputs.result).id }}
    body: |
      {
        "type": "ach",
        "account_number": "123456789",
        "routing_number": "021000021",
        "account_type": "checking"
      }

- name: Get quote
  id: quote
  uses: w3/iron@v1
  with:
    command: get-quote
    api-key: ${{ secrets.IRON_API_KEY }}
    api-url: https://api.sandbox.iron.xyz
    customer-id: ${{ fromJSON(steps.customer.outputs.result).id }}
    source-currency: USD
    destination-currency: USDC
    source-amount: '1000'

- name: Create autoramp
  uses: w3/iron@v1
  with:
    command: create-autoramp
    api-key: ${{ secrets.IRON_API_KEY }}
    api-url: https://api.sandbox.iron.xyz
    body: |
      {
        "customer_id": "${{ fromJSON(steps.customer.outputs.result).id }}",
        "source_currency": "USD",
        "destination_currency": "USDC",
        "source_amount": "1000",
        "deposit_rail": "ach",
        "destination_address_id": "addr_456"
      }
```

## Error handling

The action fails with a descriptive message on:

- Missing or invalid API key
- Missing required inputs for the command
- Iron API errors (validation, rate limit, server error)
- Invalid JSON in `body` input
