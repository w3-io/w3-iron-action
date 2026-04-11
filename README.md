# W3 Iron Action

Iron fiat-to-crypto on/off-ramp, autoramps, stablecoin operations, KYC, and bank account management for W3 workflows.

## Quick Start

```yaml
- uses: w3/iron@v1
  id: quote
  with:
    command: get-quote
    api-key: ${{ secrets.IRON_API_KEY }}
    customer-id: cust_123
    source-currency: USD
    destination-currency: USDC
    source-amount: "1000"

- uses: w3/iron@v1
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

## Commands

### Autoramps

| Command                       | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `create-autoramp`             | Create a new on-ramp, off-ramp, or swap autoramp |
| `get-autoramp`                | Get an autoramp by ID                            |
| `get-autoramp-by-external-id` | Get an autoramp by your external ID              |
| `list-autoramps`              | List autoramps for a customer                    |
| `cancel-autoramp`             | Cancel an autoramp                               |
| `patch-autoramp`              | Update an autoramp's market settings             |
| `get-quote`                   | Get a locked-rate quote for an autoramp          |
| `check-limit`                 | Check if a customer can create more autoramps    |
| `retry-autoramp-auth`         | Retry authentication for an autoramp             |

### Open Banking

| Command                       | Description                         |
| ----------------------------- | ----------------------------------- |
| `create-open-banking-payment` | Create an open banking payment link |
| `get-open-banking-payment`    | Get an open banking payment status  |

### Transactions

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `list-transactions`       | List autoramp transactions with filters |
| `get-transactions-by-ids` | Get transactions by specific IDs        |

### Customers

| Command                       | Description                                |
| ----------------------------- | ------------------------------------------ |
| `create-customer`             | Create a new customer (person or business) |
| `get-customer`                | Get a customer by ID                       |
| `get-customer-by-external-id` | Get a customer by your external ID         |
| `update-customer`             | Update customer details                    |
| `list-customers`              | List all customers                         |
| `get-customer-abilities`      | Get what a customer is able to do          |

### KYC / Identification

| Command                        | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `create-identification`        | Start KYC/KYB verification for a customer          |
| `get-identification`           | Get identification status                          |
| `list-identifications`         | List all identifications for a customer            |
| `get-compliance-questionnaire` | Get compliance questionnaire for an identification |

### Signings

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `create-signing`        | Create a customer signing (terms acceptance) |
| `list-signings`         | List all signings for a customer             |
| `get-required-signings` | Get required signings for a customer         |

### Crypto Addresses

| Command                      | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `register-hosted-wallet`     | Register a hosted (exchange) wallet address            |
| `register-selfhosted-wallet` | Register a self-hosted wallet address                  |
| `list-crypto-addresses`      | List registered crypto addresses for a customer        |
| `disable-crypto-address`     | Disable a verified crypto address                      |
| `search-vasps`               | Search hosted wallet providers (VASPs) for Travel Rule |

### Fiat Addresses (Bank Accounts)

| Command                 | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `register-bank-account` | Register a bank account (SEPA, ACH, Wire, RTP, SWIFT, CHAPS, FPS) |
| `list-bank-accounts`    | List bank accounts (all or per customer)                          |
| `get-bank-account`      | Get a specific bank account                                       |
| `delete-bank-account`   | Delete a bank account                                             |
| `retry-bank-auth`       | Retry bank account authentication                                 |

### Bank Account Authentication

| Command             | Description                                   |
| ------------------- | --------------------------------------------- |
| `get-auth-code`     | Get pending authentication code for an entity |
| `submit-auth-code`  | Submit an authentication code                 |
| `get-microdeposits` | Get microdeposit verification status          |

### Reference Data

| Command                    | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `list-cryptocurrencies`    | List all supported cryptocurrencies               |
| `list-fiat-currencies`     | List all supported fiat currencies                |
| `get-exchange-rate`        | Get exchange rate between two currencies          |
| `get-fee-profiles`         | Get partner fee profiles                          |
| `get-terms`                | Get current terms and conditions                  |
| `get-country-subdivisions` | Get subdivisions (states/provinces) for a country |

### Webhooks

| Command          | Description                    |
| ---------------- | ------------------------------ |
| `list-webhooks`  | List all configured webhooks   |
| `update-webhook` | Update a webhook configuration |
| `ping-webhook`   | Send a test ping to a webhook  |

### Sandbox

| Command                            | Description                                |
| ---------------------------------- | ------------------------------------------ |
| `sandbox-reset`                    | Reset the sandbox environment              |
| `sandbox-mock-transaction`         | Create a mock transaction                  |
| `sandbox-update-autoramp`          | Update autoramp status in sandbox          |
| `sandbox-update-fiat-verification` | Update fiat verification status in sandbox |
| `sandbox-update-identification`    | Update identification status in sandbox    |
| `sandbox-update-transaction`       | Update transaction state in sandbox        |

## Inputs

| Name                   | Required | Default                | Description                                               |
| ---------------------- | -------- | ---------------------- | --------------------------------------------------------- |
| `command`              | Yes      |                        | Operation to perform (48 commands)                        |
| `api-key`              | Yes      |                        | Iron API key (`X-API-Key` header)                         |
| `api-url`              | No       | `https://api.iron.xyz` | API base URL (production or sandbox)                      |
| `customer-id`          | No       |                        | Customer ID                                               |
| `autoramp-id`          | No       |                        | Autoramp ID                                               |
| `external-id`          | No       |                        | External ID for cross-referencing with your system        |
| `address-id`           | No       |                        | Address, identification, or entity ID (context-dependent) |
| `body`                 | No       |                        | Request body as JSON (for create/update operations)       |
| `limit`                | No       |                        | Pagination limit                                          |
| `offset`               | No       |                        | Pagination offset                                         |
| `status`               | No       |                        | Status filter for list operations                         |
| `idempotency-key`      | No       |                        | UUID for idempotent write operations                      |
| `source-currency`      | No       |                        | Source currency for quotes (e.g. USD, USDC)               |
| `destination-currency` | No       |                        | Destination currency for quotes                           |
| `source-amount`        | No       |                        | Amount in source currency                                 |
| `destination-amount`   | No       |                        | Amount in destination currency                            |
| `side`                 | No       |                        | Quote side (source or destination amount fixed)           |
| `base-currency`        | No       |                        | Base currency for exchange rate                           |
| `quote-currency`       | No       |                        | Quote currency for exchange rate                          |
| `transaction-ids`      | No       |                        | Comma-separated transaction IDs                           |
| `sandbox-status`       | No       |                        | Status for sandbox update operations                      |
| `webhook-id`           | No       |                        | Webhook ID                                                |
| `country-code`         | No       |                        | ISO country code                                          |
| `vasp-query`           | No       |                        | VASP search query                                         |
| `payment-id`           | No       |                        | Open banking payment ID                                   |

## Outputs

| Name     | Description                   |
| -------- | ----------------------------- |
| `result` | Command result as JSON string |

## Authentication

Iron uses API key authentication via the `X-API-Key` header. Get your API key from the Iron dashboard.

| Environment | URL                              |
| ----------- | -------------------------------- |
| Production  | `https://api.iron.xyz` (default) |
| Sandbox     | `https://api.sandbox.iron.xyz`   |
