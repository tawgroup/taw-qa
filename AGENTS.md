# taw-qa

## Language for the human

The PO reads Vietnamese. In everything written FOR the human (grilling questions, recommendations, summaries, and docs: `CONTEXT.md`, ADRs, tickets, specs): Vietnamese, short full sentences, common words, no idioms, no telegram-style fragments. One idea per sentence. Do not sacrifice grammar for concision. Keep technical terms in English.

## Grilling UX

When a question tool is available (`ask_user_question` in Grok, `AskUserQuestion` in Claude Code), present each grilling round via that tool (chunk rounds of >4 questions into multiple calls; put the recommended answer as the first option, labelled `(Recommended)`). Fall back to the standard ❓/➡️ text format elsewhere.

## Agent skills

### Issue tracker

Issues and specs for this repo live in Linear: workspace `andie-monterro`, team `Andie-monterro` (`AND`), project `taw-qa`. Use the `linear-monterro` MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

Default Matt Pocock triage labels, applied as Linear issue labels on team `Andie-monterro`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.
