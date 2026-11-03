---
'@openai/agents-extensions': patch
---

fix: stop using AI SDK reasoning stream-part ids as reasoning item ids, so Anthropic, Bedrock, and Google thinking blocks from different turns are no longer collapsed into one replayed item.
