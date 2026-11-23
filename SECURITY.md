# Security

`dsh-market-census` is a read-only analysis plugin over one JSON file.

## What the plugin touches

- Reads exactly one file: the snapshot you point it at (`path`, `DSH_MARKET_FILE`,
  or `$DSH_HOME/market/plugins.json`). No other paths are opened.
- No environment variables besides the three above.
- Writes nothing; creates no directories.

## What it never does

- No network access of any kind (it does not download the market).
- No model or LLM calls.
- No shell commands, no file mutation, no telemetry.

## Risk surface

Input is untrusted JSON: fields are coerced to strings/numbers and anything
malformed is skipped. A hostile snapshot can at most produce misleading counts;
it cannot execute code. Similarity is computed in-process with bounded loops.
