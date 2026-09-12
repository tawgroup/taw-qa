# Issue tracker: Linear

Issues and specs for this repo live in Linear. Use the `linear-monterro` MCP tools (search with `search_tool`, then call with `use_tool`). Do not use GitHub Issues for this repo's engineering-skill tickets.

## Defaults

| Field | Value |
| --- | --- |
| Workspace | `andie-monterro` |
| Team | `Andie-monterro` (key `AND`, id `528b9322-c651-47c1-8493-bcc812e6a710`) |
| Project | `taw-qa` (id `b0634e00-cf7c-4810-b181-838f416d8ee9`) |
| Project URL | https://linear.app/andie-monterro/project/taw-qa-649f28cdaa56 |
| GitHub repo (code only) | https://github.com/tawgroup/taw-qa |

Always set `team` to `Andie-monterro` and `project` to `taw-qa` when creating issues for this repo, unless the user names another project.

## Conventions

- **Create an issue**: `linear-monterro__save_issue` with `team: "Andie-monterro"`, `project: "taw-qa"`, `title`, and `description` as Markdown. Do not pass `id` when creating. Use a heredoc-style literal body (real newlines, not `\\n`).
- **Read an issue**: `linear-monterro__get_issue` (or `list_issues` with the identifier such as `AND-123`) and include comments when the skill needs them.
- **List issues**: `linear-monterro__list_issues` with `team: "Andie-monterro"` and `project: "taw-qa"`. Filter by `label`, `state`, `assignee` (`"me"` for the current user).
- **Comment**: `linear-monterro__save_comment` with `issueId` (identifier like `AND-123` or UUID) and `body`.
- **Apply / remove labels**: `linear-monterro__save_issue` with `id` set to the issue, then `addLabels` / `removeLabels`. Do not replace the full set unless you mean to.
- **Close**: `linear-monterro__save_issue` with `id` and `state: "Done"` (completed) or `state: "Canceled"` (wontfix / rejected). Add a comment first when the skill asks for one.

Issue identifiers look like `AND-123`. P-prefixed identifiers (e.g. `P-AND-123`) are projects, not issues.

## Workflow states (Linear)

| Linear state | Type | Use |
| --- | --- | --- |
| Backlog | backlog | parked |
| Todo | unstarted | default for new agent-ready work |
| In Progress | started | claimed / being implemented |
| Done | completed | resolved |
| Canceled | canceled | wontfix / rejected |
| Duplicate | duplicate | duplicate of another issue |

Triage **roles** are labels, not workflow states. Keep the Linear state in `Todo` while triaging unless closing.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

GitHub PRs are not part of the Linear triage queue.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `Andie-monterro` in project `taw-qa`.

## When a skill says "fetch the relevant ticket"

Load the Linear issue by identifier (`AND-123`) or URL, including comments.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single Linear issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Create with `linear-monterro__save_issue`, `addLabels: ["wayfinder:map"]`, `project: "taw-qa"`.
- **Child ticket**: an issue with `parentId` set to the map issue. Labels: `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`). Once claimed, assign with `assignee: "me"`.
- **Blocking**: Linear native relations. On create or update, pass `blockedBy: ["AND-n", ...]` and/or `blocks: ["AND-n", ...]`. A ticket is unblocked when every blocker is `Done` or `Canceled`.
- **Frontier query**: `list_issues` on project `taw-qa` with `parentId` of the map (or list children via the map). Drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `save_issue` with `assignee: "me"` and `state: "In Progress"`.
- **Resolve**: comment the answer, then `state: "Done"`, then append a context pointer to the map's Decisions-so-far.

These wayfinder labels already exist on team `Andie-monterro`: `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`.
