# E2E Test Results

> Last verified: 2026-04-15 -- YAML fixed, not yet run
>
> **Note (2026-04-16):** These results have not been verified against a
> live sandbox run. The YAML was corrected on 2026-04-15 but the E2E
> workflow needs to be re-executed with current credentials before the
> Status column can be trusted. All statuses below remain NOT YET
> VERIFIED until that re-run happens.

## Prerequisites

| Credential             | Env var        | Source         |
| ---------------------- | -------------- | -------------- |
| Iron API key (sandbox) | `IRON_API_KEY` | Iron dashboard |

## Results

| #   | Step                     | Command                    | Status           | Notes                            |
| --- | ------------------------ | -------------------------- | ---------------- | -------------------------------- |
| 1   | List cryptocurrencies    | `list-cryptocurrencies`    | NOT YET VERIFIED | Sandbox API                      |
| 2   | List fiat currencies     | `list-fiat-currencies`     | NOT YET VERIFIED |                                  |
| 3   | Get fee profiles         | `get-fee-profiles`         | NOT YET VERIFIED |                                  |
| 4   | Get terms of service     | `get-terms`                | NOT YET VERIFIED |                                  |
| 5   | Get country subdivisions | `get-country-subdivisions` | NOT YET VERIFIED |                                  |
| 6   | List webhooks            | `list-webhooks`            | NOT YET VERIFIED |                                  |
| 7   | Update webhook           | `update-webhook`           | NOT YET VERIFIED | Conditional on webhook existence |
| 8   | Ping webhook             | `ping-webhook`             | NOT YET VERIFIED | Conditional on webhook existence |
| 9   | List customers           | `list-customers`           | NOT YET VERIFIED |                                  |
| 10  | List transactions        | `list-transactions`        | NOT YET VERIFIED |                                  |
| 11  | List autoramps           | `list-autoramps`           | NOT YET VERIFIED |                                  |
| 12  | Sandbox reset            | `sandbox-reset`            | NOT YET VERIFIED |                                  |

## Skipped Commands

| Command                         | Reason                                  |
| ------------------------------- | --------------------------------------- |
| `get-exchange-rate`             | Sandbox limitation                      |
| `create-customer`               | Sandbox limitation                      |
| KYC/signing/bank/quote commands | Sandbox limitation; depends on customer |

## How to run

```bash
# Export credentials
export IRON_API_KEY="..."

# Run
w3 workflow test --execute test/workflows/e2e.yaml
```
