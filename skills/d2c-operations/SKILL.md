---
name: d2c-operations
description: Operate this codex_version D2C workspace: research queued trends, read multi-store Naver sync results, create and revise marketing campaigns with Codex tools, post to configured social channels, and record confirmed publications. Use for work on this local app, not unrelated commerce projects.
---

# D2C operations

Run commands from `codex_version`; executable is `node src/cli.mjs`. Do not edit sibling projects. Read `../../docs/codex-workflow.md` for exact payload examples when needed.

## Product and order work

- `status`, `naver-stores`, `products`, `orders` read persisted data. `sync all|products|orders [--store <id>]` makes actual read-only Naver API requests and writes local results. Missing keys must remain an explicit error.
- Report the last successful checkpoint and run failure separately. Changed product-order count is not new customer orders or incremental revenue. Stored order data intentionally excludes shipping PII.
- For an explicit historical catch-up use `sync orders --from <ISO>`. Do not repeatedly resync all products to answer a marketing question.

## Marketing

1. Read `jobs`, then `campaign brief <id>`. For a new user request select a real product and use `campaign create --file <json>`.
2. Ground copy in the product snapshot and compare the current product. Do not invent promotion conditions. Use web search only when it helps; save the supporting URLs and publication dates.
3. Use the current Codex conversation to write copy and available built-in image tools to create/edit requested assets. No separate AI API key is needed. If image tools are unavailable, retain a draft and report the missing piece.
4. Save the output JSON and image under `data/work/<campaign-id>/`. Apply with `campaign apply <id> --file <json>` including the exact revision read. A stale version requires rereading, not overwriting.
5. Open the local app in Codex's browser and select the campaign for review. The user can also refresh the existing tab. No subscription-model inference endpoint is exposed by the local UI.

## Trend research

1. Read `trend list` and process only records with `PENDING` status. Use `trend brief <id>` to obtain the exact revision and current sale products.
2. Browse the web because recency and source attribution are essential. Prefer primary or authoritative sources and verify publication dates. Group duplicate coverage into one topic.
3. Return useful marketing context rather than a generic news digest: summary, product relevance, campaign angle, suitable channels, useful-until date, and cautions.
4. Do not turn tragedies, public emergencies, political conflict, or unsupported health claims into promotional hooks. A low-relevance topic may be omitted.
5. Save 1-12 items with 1-5 real sources each under `data/work/<trend-id>/result.json`, then run `trend apply <id> --file <json>` with the exact revision. Only reference product IDs returned by the brief.
6. Tell the user to refresh the dashboard after applying results. The local UI queues and displays research; it does not call the subscription model by itself.

## SNS channels

- Prepare and review the campaign in the app. The app can start Playwright login and publish workers for Instagram, Threads, and Naver Band; their profiles belong only to `codex_version` and must never be copied from another version.
- The user must check the immediate-share box in the app before the worker can publish. Login and MFA remain user actions in the visible dedicated browser. Never print or inspect cookies.
- Treat `COMPLETED` as confirmation that the channel web UI reached its completion condition, then verify the actual post and permalink. On `FAILED` or `INTERRUPTED`, inspect the channel before retrying to avoid duplicates.
- Verify the published post matches the reviewed campaign and capture its actual permalink. Use `campaign record-published` with `channel`, URL, and revision only after confirmation.
- If result is uncertain, inspect the account before retrying to avoid duplicate posts. A logged URL is an operator/agent attestation, not an automatic Meta API verification.

## Recurring operation

Create Codex schedules only if requested. Use the same local workspace, read saved results, stay quiet on unchanged/non-actionable states. Machine and Codex app must be running for local scheduled work. Fixed polling can instead use the documented Windows scheduler command without model inference.
