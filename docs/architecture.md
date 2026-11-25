# Web application architecture

The web application implements the Rumbo contexts used by its current screens:

| Context | Responsibility |
| --- | --- |
| `iam` | Administrator sign-in, sign-up, session verification, and password recovery |
| `planning` | Clinics, sites, floors, plans, calibration, draft graphs, map editing, and beacons |

Other contexts from the project report (`profiles`, `subscriptions`, `communications`, `navigation`, and `analytics`) have no separate web feature here yet. The administrator home and reusable layouts live in `shared/presentation`; they do not own domain rules.

Each implemented context uses four layers:

- `domain`: models, invariants, graph and geometry rules. No Angular, HTTP, or browser storage.
- `application`: editor state, proposal operations, use-case contracts, and ports. It may use Angular signals and dependency injection, but imports neither infrastructure nor presentation.
- `infrastructure`: HTTP adapters, session persistence, guards, and interceptors. Adapters implement application ports.
- `presentation`: Angular components, templates, styles, UI validation, and messages.

`app.config.ts` is the composition root: it binds application ports to their infrastructure adapters. Components inject the ports, so a screen does not depend on an HTTP endpoint or persistence implementation. IAM session verification and refresh are coordinated in Application through separate HTTP and storage ports. Shared presentation code may consume a context's public application port but does not hold its business rules.

The existing URLs, server contracts, local session key, map editing behavior, generated proposal review, and draft concurrency flow remain the same. The original floor plan is still rendered through the existing PDF preview helper; graph geometry and proposals are managed in `planning`.

## Regenerating a floor with registered destinations

The editor reconciles a saved destination only when its directory name uniquely matches a labeled ROOM or SERVICE candidate on the same floor. Matching ignores case, accents, and repeated whitespace. It retains the destination and node IDs, category, name, and specialty, moves the node to the proposed position, and rebuilds its connections with the confirmed scale. A nearby door or entrance never claims a destination by coordinate proximity.

Unmatched destinations remain in the draft and require connection review. Duplicate candidate or saved names stop proposal application until the editor resolves the ambiguity. If the selected original differs from the version currently bound to a draft with destinations, proposal application stops so the old references cannot silently point to the wrong plan. The proposal itself remains a preview until the administrator explicitly saves the draft with its revision token.

## Publishing the saved draft (PR-242)

The map editor offers publication only for a saved graph without blocking observations and with confirmed scales on every floor. A separate confirmation summarizes the floor, node, and destination counts. `MapEditorPort.publish` sends a merge-patch request with the saved ETag; the backend remains authoritative for graph and active-beacon validation. A 412 or an uncertain network result requires reloading before another attempt. Validation errors keep the draft available and identify the rejected elements; beacon issues link to inventory review. The success state removes the editing workspace. This increment publishes through the existing endpoint; published-model synchronization in Mobile belongs to PR-244.
