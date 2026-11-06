# AI agent end-to-end test (run 2026-11-06 against the live project)

Throwaway business "AI Test Shop" (one product, one policy, a fake WhatsApp number), deleted afterwards with its keys.

| Chat | How it arrived | Expected | Result |
| --- | --- | --- | --- |
| "How much is the body cream?" (no AI key) | signed WhatsApp webhook → AI woken at once | not answered, reason shown | `The AI isn't connected — add your Anthropic API key under AI Agent` within seconds |
| Same chat, fake Anthropic key | ai-reply run by the scheduled job | AI service reached, refusal recorded, retried later | `401 invalid x-api-key` saved on the chat and the AI connection |
| "Please let me talk to your manager" | database | handover without calling the model | reply queued (labelled AI), chat → team, flagged priority, handover logged |
| "STOP" | database | no reply, marked dealt with | no reply, answered |
| Handover reply | WhatsApp sender, next minute | sent to Meta | Meta refused the fake token (`190 Malformed access token`), retry 1 of 3 |
