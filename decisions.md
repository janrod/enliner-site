# DECISIONS.md

Running log of changes and challenges to the locked decisions (`Docs/specs/decisions.md`).

## 2026-08-09 — PR-D8 Phase 6: the Pages sidebar is now pure SwiftUI; the AppKit `NSOutlineView` retired

The pure-SwiftUI Pages sidebar (`SidebarPagesTree` + `SidebarKeyCatcher` + the `SidebarSelection`
click/cursor reducer + `SidebarFlatten`), A/B-verified live (no crashes; multi-select, keyboard nav,
context menus, dark/light), is now the **only** Pages-list renderer. The `sidebar.pureSwiftUI`
`@AppStorage` flag (default was already flipped to `true`) and its dead flag-off branch were removed,
and `SidebarOutlineView.swift` (~1799 lines of AppKit — the `NSOutlineView` representable, its
Coordinator, the `SidebarItem` row-model class, `HostingTableCell`, `SidebarSelectionRowView`, the
NSMenu action-box plumbing, and the structural `Signature`) was **DELETED**. The two still-shared pure
menu shapes (`SidebarPageMenu`, `SidebarFolderMenu`) and the `SidebarItem.SectionKind` toggle namespace
were extracted first into `Sources/Outliner/Sidebar/SidebarContextMenus.swift` (same `Outliner` target,
so no caller edits). The two AppKit-only pure helpers in `OutlinerCore/SidebarSelection.swift`
(`selectionForExternalNav`, `navigationForAppKitSelection`) and their tests were removed (no remaining
callers). `swift build` + the app `xcodebuild` are green.

- **REVERSES PR-D8 §1's "the Pages list is a native SwiftUI `List`."** It is a `ScrollView` +
  `LazyVStack`, not a `List`: a `List` (== `NSTableView` under the hood) threw an uncatchable
  multi-select `_NSViewLayout` exception on macOS 26, and its selection bridge delivered the same
  transient intermediate sets that defeated the four `List(selection:)` attempts. The app owns the
  selection (`SidebarSelectionModel`: a `Set<PageID>` + a ⇧-anchor), never bound to a `List`.
- **One remaining AppKit seam:** keyboard nav (↑/↓, ⇧-extend, type-select, Return, ⌫) is delivered by
  a `SidebarKeyCatcher` AppKit first-responder view — SwiftUI's `@FocusState` cannot reclaim
  first-responder from the editor. This mirrors the editor's `TextInputProxyView` seam. Everything
  else in the sidebar is pure SwiftUI.
- **Mouse-⌫ contract:** ⌫ deletes the selection only while keyboard nav holds first-responder; a
  mouse click-open hands first-responder to the editor (so a stray ⌫ in the editor never deletes a
  sidebar page).

## 2026-08-08 — Post-v1 Markdown roadmap: six PRDs approved, decisions locked, work queued

> **UPDATE 2026-08-09 — 4 of 6 SHIPPED to `main`:** highlight `==` (`b8134d2`), callouts
> `RowType.callout` (`08b7f66` + CRDT round-trip test `9ae5b2d`), reference-links
> normalize-on-import (`5eb3be2`), math `$…$`/`$$…$$` + SwiftMath dep (`ccff59c`). Each ran the
> full code→review→fix→verify pipeline (review caught a real idempotence bug in ref-links and a
> `$` byte-loss in math). Remaining 2 are gated: **code syntax highlighting** (needs code Phase 2)
> and **table grid finish** (needs PSE Phase-C). SwiftMath (mgriebling/SwiftMath 1.7.3) is now a
> real dependency on `main`, OutlineEditor-target-only. **These four SHIPPED features are now
> merged into `feat/pure-swiftui-editor` and re-homed onto the pure-SwiftUI Canvas render path.**

Following the render-policy audit (D31 below), six extended-Markdown / stubbed features were
reconsidered "now that we're well past v1" and each given a build-ready PRD in `Docs/prds/backlog/`.
Jan's locked decisions (2026-08-08):

- **Highlight `==`** — approved (D31). Ready; **first in the queue** (current editor, no dependency).
- **Reference-style links** — **Option B: normalize-on-import** (not render-in-place). Rewrite
  `[text][ref]` → `[text](url)` and drop orphaned defs on the paste/import path (reuses D26's
  `MarkdownPasteParser` foreign-normalization); zero runtime cost, no model-layer change. Ready.
- **Callouts / admonitions** (`> [!note]`) — new **`RowType.callout(kind:collapsed:)`** case (not a
  `.quote` attribute), so exhaustive switches are compiler-enforced. Extends D26. Ready.
- **Code syntax highlighting** (code-block Phase 3) — **tree-sitter** (SwiftTreeSitter + grammars),
  NOT the hand-rolled tokenizer the PRD first recommended. Quality-first: a real parse beats regex
  guessing and reparses incrementally; the second C dep (after Loro) is acceptable; sits behind a
  `SyntaxTokenizer` protocol. **Gated on code Phase 2 (editing) landing first.**
- **Table grid (Phase B)** — no new decision; the grid engine is already built on
  `feat/pure-swiftui-editor` (`TableGrid.swift` et al.). ~2-day finish (Canvas-sink render spike +
  seam tests + comment cleanup), **gated on PSE Phase-C** (AppKit elimination) to avoid dual-path bugs.
- **Math** (`$…$` / `$$…$$`) — build it (demand confirmed); **SwiftMath** (CoreText-native, keeps
  WebKit out of the editor layer), not KaTeX/WebKit. Largest item (~10–15d), sequenced last.

Two dependencies registered in `Docs/specs/architecture.md` per §2.8: **tree-sitter** (code
highlighting) and **SwiftMath** (math). Queue order = ready-first: highlight → reference-links →
callouts → code-highlighting (after Phase 2) → tables (after PSE Phase-C) → math.
Policy table: `Docs/specs/interactions/markdown-constructs.md` §E.

## 2026-08-08 — D31: highlight `==text==` promoted from non-goal to v1 mark; whole-Markdown render policy made explicit

- **Context.** A `---`-should-be-a-horizontal-rule question surfaced that Enliner's Markdown
  render behavior was *emergent* (whatever the parser happened to recognize), not a stated policy.
  A full audit of the inline parser, the render path, and the specs produced an **opinionated
  per-construct policy** — for every Markdown construct, whether we render it and how, or keep it
  literal and why. Recorded in [`Docs/specs/interactions/markdown-constructs.md`](Docs/specs/interactions/markdown-constructs.md)
  (rewritten as the policy, replacing the old ad-hoc gaps table), anchored on five generating
  principles (every-row-is-a-list-item, source-canonical, structure-replaces-document-flow,
  whitespace-is-outline-depth, overloaded-syntax-is-disqualifying).
- **D31 — highlight `==text==` is now a v1 inline mark** (reverses the prior non-goal). It clears
  the "add an inline mark" bar: single-line, delimiter-paired (symmetric with `strike ~~`), and a
  genuine note-taking primitive we were conspicuously missing. Adds a `Mark.highlight` case + `==`
  grammar; renders as a wash behind the text; source-canonical (D20) like every other mark, so
  round-trip (S4) is preserved. Implementation is a follow-on pipeline (parser + renderer +
  headless tests) — not yet built.
- **Thematic break `---` stays literal** (the triggering question). Overloaded three ways
  (thematic break / setext H2 / YAML fence) with no node home in a one-row model. If visual
  dividers are ever wanted, the clean path is a `RowType.divider` (`- ---`), never bare `---` —
  parked, not v1.
- **No change to the other non-goals** (underline, math, footnotes, inline HTML, indented code,
  bare `>` quotes, alt bullet markers) — each now has a recorded reason rather than silence.

## 2026-08-07 — Platform floor raised macOS 14+ → **macOS 26+** (Jan)

The minimum supported OS moves from macOS 14 to **macOS 26** (target 26/27). Rationale (Jan):
the app already depends on macOS-26-only surfaces (MLX, the `SpeechAnalyzer` transcriber, Tahoe
Liquid Glass icon), and there is no reason to carry older-macOS support. Changes: `Package.swift`
`platforms: [.macOS(.v26), .iOS(.v26)]`; `project.yml` `deploymentTarget` 26.0 (app + app-tests);
overview/CLAUDE headline platform line. `swift build` green on the new floor.

**Consequence for the pure-SwiftUI editor (Phase B / B3):** the macOS-26 floor unlocks the modern
SwiftUI scroll APIs (`ScrollPosition.scrollTo(point:)` for a precise settable pixel offset,
`onScrollGeometryChange` for reads). B3's anchor-stable scroll is therefore built in **pure SwiftUI**
(design §5 as originally intended) — the macOS-14-era `NSScrollView` scroll-seam fallback is
**eliminated**, keeping AppKit confined to the single input/IME proxy seam (PR-D7).

## 2026-08-05 — App rename Gardliner → Enliner (title case)

The app's brand, repos, and bundle identifier are renamed from **Gardliner** to **Enliner**,
per `Docs/prds/backlog/app-rename-enliner.md`. This is a pre-launch alpha rename (no shipped
users to migrate). Key points:

- **RB-D1** — code modules are **NOT** renamed; the SwiftUI target and model package stay
  `Outliner` / `OutlineModel` etc. Only the user-facing brand and machine tokens change.
- **RB-D2** — clean break, **no migration path** (alpha; no existing installs to preserve).
- **RB-D3** — bundle identifier becomes `com.enliner.app` (was `com.gardliner.app`).
- **RB-D5 / display name** — display name is the **title-case** `Enliner` (chosen over the
  PRD's lowercase RB-D5 default, per Jan). Machine/id-like tokens stay lowercase: repos
  `enliner` / `enliner-relay`, service type `_enliner._tcp`, invite prefixes
  `enliner-invite1:`, URL scheme `enliner://`, crypto domains `enliner/...`, env vars
  `ENLINER_RELAY_*`.

Historical entries below have been swept to `Enliner` for consistency (pre-launch alpha, so
quoted then-names are updated in place); this entry records the rename itself and its date.
Supersedes the display-name half of Q7 (2026-07-09), which had chosen "Gardliner".

## 2026-08-05 — Soft-break line geometry + caret-motion parity with NSTextView (S1/editor.md)

Fixes a cluster of intra-block caret bugs around soft breaks (a literal `\n` inside one block's
`SourceText`, via Shift+Return) and pins the "correct" behavior to **AppKit's NSTextView/NSLayoutManager**
as the oracle. Not a new locked `Dxx`; this records the behavior now nailed down so future caret/layout
work does not silently regress it. Branch `fix/trailing-newline-line-fragment` (commits `047fb14`,
`12eddbf`, `b32c551`). Fulfils editor.md's "each `\n` is a real visual line" + line-scoped-key rules.

**What was wrong (all reported by Jan, one at a time):**
1. A block ending in `\n` showed **no trailing empty line** — Shift+Return at end-of-block looked like a
   no-op until a second `\n`. Root: `CTFramesetterCreateFrame` DROPS the trailing empty line and reserves
   no height (NSLayoutManager synthesizes it via `extraLineFragmentRect`; raw CoreText does not).
2. Up/down arrow could **not enter a blank soft-break line** (stuck on the line below).
3. **Down** on the last visual line / **Up** on the first were **no-ops** (should snap to block end / 0).
4. `End`/`⌘→` landed **after** a line's trailing `\n` (= next line's start), so a later `→` **skipped** a
   line.

**Decisions pinned:**
- **Two layout paths, one contract.** The non-windowed (linear) `BlockLayoutEngine.typeset` now synthesizes
  the trailing empty line the windowed `BlockLineIndex` path already had; BOTH the `window==nil` and
  `window!=nil` branches of `CaretGeometry.offset(_:line:nearestLocalX:)` clamp a non-last `\n`-terminated
  line before its terminator. **Windowing is enabled by default** (`OutlineWindowingConfig.enabledByDefault
  = true`), so the windowed path is production-reachable ≥4000 scalars — any line/caret-geometry change
  MUST fix both branches.
- **Caret-motion semantics match NSTextView:** ⬆ on the first visual line → offset 0; ⬇ on the last →
  block end (both PRESERVING the goal column); `endLine` returns the position **before** a hard `\n`
  (downstream), soft-wrapped non-last lines keep the wrap boundary (upstream), the last line keeps its
  upper bound.
- **The gate:** `CaretMotionMatrixTests` is a differential harness (our `CaretMotion.resolve` over the real
  `EngineGeometry` vs. a headless NSTextView oracle) across content shapes × verbs × every offset, running
  as a green regression gate (`failOnDivergence = true`). New caret-motion regressions are added there
  rather than hand-debugged. Companion model-layer fix earlier: `1167647` fixed the caretHint (model) half
  of "Shift+Return takes two presses"; these fix the geometry/motion half.

## 2026-08-05 — D29: native fenced code blocks (`RowType.code`) — the SECOND multi-line block type

Adds `RowType.code(language: String?)`, mirroring the `RowType.table` (D1/D5) multi-line-block precedent
at every layer. Motivated by the bundled manual, whose fenced code blocks previously rendered as garbage
(fences → literal bullets, indented body → outline nesting). Design: `Docs/prds/backlog/code-block-rowtype.md`
(approved on-disk format, 2026-08-05, Jan).

**On-disk serialization (permanent).** One block. The verbatim opening fence rides the `- ` marker; the
body + closing `` ``` `` are `indent + "  "` continuation lines, `\n`-joined; the `^ulid` anchor sits on
the header line:

```
- ```swift ^01J2K…
  func greet() {
      print("hi")
  }
  ```
```

- **Source is canonical (D20):** `SourceText` is the verbatim multi-line source (opening fence + body +
  close). `language` is a **derived convenience** — re-parsed from the opening fence's info string on read
  (`CodeBlockSource.language`, shared by the reader / index `IndexQueries.decodeBlock` / CRDT
  `decodeRowType`), NEVER used to reconstruct bytes on write. Bare `` ``` `` fence → `language == nil`;
  an info string with spaces is kept verbatim.
- **Classification:** the post-`- ` text begins with `` ``` `` (three backticks). Only the native
  `` - ``` `` marker form is recognised on disk (a bare CommonMark `` ``` `` degrades to a plain bullet;
  paste-ingest out of scope).
- **Body is verbatim — no marker/drawer escaping.** The reader gathers the body **marker-blind AND
  drawer-blind**: every `indent + "  "` line is literal body until the first continuation whose stripped
  text is exactly `` ``` `` (close, inclusive). A body line like `- item` / `key:: value` / an indented
  line is preserved byte-for-byte (the `lineIsNestedChildMarker` heuristic does NOT apply in code mode).
  The writer is symmetric (skips `escapeMarkerLookalike`/`escapeDrawerLookalike` on the body). This is why
  an indented body line no longer misreads as outline nesting.
- **Termination:** the closing `` ``` `` line (inclusive); EOF/dedent → unterminated fence still reads
  `.code` and round-trips verbatim (no auto-inserted close).
- **Round-trip guard (clones the D26 quote guard exactly):** a non-code block whose text begins `` ``` ``
  writes escaped (`` - \``` … ``) and unescapes on read → never reclassified as code. Same single lossy
  corner (`\`-prefix loss) as quotes/marker escapes; classification stays safe.
- **No migration:** no legacy shape to fold — a code block never sets `wasNormalized`
  (`open → no-op → save` byte-stable, `wasNormalized == false`).

**Layers touched** (mirrors the `.table` exhaustive-switch sites): `Block.swift` (+ `CodeBlockSource`
helper), `MarkdownReader` (classify + `parseCodeBodyLine` gather + `unescapeLeadingFence`),
`MarkdownWriter` (`.code` marker + body-escape gate + `escapeLeadingFence`), `IndexWriter.encodeType`,
`IndexQueries.decodeType`/`decodeBlock`, `CommandStore.splitInheritedType` (→ `.bullet`, like `.table`),
`LoroCRDTMirror.encodeRowType`/`decodeRowType`, `RevealPrefix`, `BacklinkContext`, plus editor render:
`AttributedStringBuilder.baseAttributes` (mono font + dimmed fence lines), `BlockLayoutEngine`
(`adornmentGlyph` nil + full-width `codeBackgroundRect` card), `OutlineView.drawRowChrome`,
`ContextMenuModel.isSameType`, `RowGeometry.codeCardHorizontalPad`. `theme.fonts.mono` already existed.

**Phase 1 render only:** verbatim monospace over a subtle full-width code-card background, fence lines
DIMMED (no hiding). Fence-hiding, a language chip, syntax highlighting, and live type-```-Enter fold are
Phase 2 (not built).

Tests: `CodeBlockIOTests` (12 cases: fold-to-one, verbatim source, byte-stable per body shape, language
variants, blank/indented/marker-lookalike body, the indented-body-not-nesting regression, the
``` -leading escape guard, unterminated fence, code-as-child/with-children, index type re-derive,
`splitInheritedType(.code)==.bullet`); `IndexTests.typeEncoding_allCases` extended; a `.code` fidelity test
in `VaultMirrorFidelityTests` (CRDT type + language re-derive round-trip); and `RandomPageGenerator` now
emits `.code` blocks so the `RoundTripTests` property test (120 seeds) covers them. Spec: `format.md`
(new code-block subsection + round-trip bullet). Format APPROVED by Jan (2026-08-05).

## 2026-08-04 — Block markers (task/heading/quote) are keyboard-removable: ⌫-at-0 and empty-Enter demote to bullet

Two coherent editor refinements so a consumed block-type marker behaves like the Markdown syntax users
expect to be able to delete. Block markers (`# `, `> `, `- [ ] `) are consumed into `RowType` and re-drawn
as a display-only reveal prefix the caret can't enter — so there was previously no keyboard gesture to
remove one (only the transient trigger-revert, valid for the single ⌫ right after the smart-trigger fired).

- **⌫ at offset 0 on a marker row → demote to `.bullet`** (drop the marker) instead of merging; a SECOND ⌫
  then merges (two-stroke, LogSeq/Obsidian parity). New rung in `handleDeleteBackward`
  (`OutlineView+Input.swift`), after the trigger-revert + scoped-zoom-root carve-outs, before
  `.mergeWithPrevious`. Reaches a former dead no-op / improves the offset-0 case.
- **Enter on an EMPTY top-level marker row → demote to `.bullet`** (exit the list) instead of chaining
  another empty marker sibling. This REFINES the documented empty-top-level "keep-adding" override (see the
  2026-07 entry / `StructuralKeyMap` decision table): the override still holds for bullet/plain/numbered; it
  is marker types that now exit. Gated on `isDepthZero` — a nested empty marker still outdents (the
  industry promote-until-top-then-exit ladder). New branch in `StructuralKeyMap.structuralCommand`.

Marker set for BOTH gestures is the single shared predicate `RevealPrefix.string(for:) != nil` =
{`.task(_)`, `.heading`, `.quote`}. `.numbered` is deliberately excluded (gutter label, not an inline
reveal). No model/format change — both reuse the existing `Command.setType`; ⌘Z restores the prior type as
one step. Tests: `MarkerDemoteBackspaceTests`, `StructuralKeyMapTests` (marker-exit cases), and the updated
`OutlineViewInputTests.backspaceAtZeroOnFocusedHeadingDemotesToBullet` (was `…StillMerges`, the old
contract). Reported by Jan (2026-08-04); scope (reveal-prefix set) confirmed by Jan.

## 2026-08-02 — Sync robustness COMPLETE on-branch (A1–B3 built + tested, NOT deployed) + activation/test sequence

All of the sync-robustness PRD (`Docs/prds/backlog/sync-robustness.md`) is now built, reviewed, and
committed — nothing is deployed to the live Pi and the snapshot behaviour is INERT until a deliberate
activation. Commits:
- **Client** (`feat/sync-robustness`, janliner): A1 `14a8f7c` · A2 `a7d1240` · B1a `4388337` · B1b `ad1b738`
  · B3 `983f950`.
- **Relay** (`feat/sync-robustness-b1b`, enliner-relay): B1b `8fd5caa` · B2+fail-safe `7aa8e02` · B3
  `9ba03f6`.
- B1b's client half + B2/B3 were partly drafted externally (Antigravity, during a rate-limit window) then
  reviewed + COMPLETED here: the missing snapshot SEND side + `.snapshot` decode were added, a premature
  capability flip reverted, app-target test breakage fixed, and a real never-cleared `pendingDropRoom` arm
  bug fixed (+regression tests). See each commit body.

**What each leg does:** A1 vault-canonical Shared (kills B7 revert). A2 self-heal an emptied/behind peer.
B1a+B1b snapshot-and-GC (owner republishes a compacted full-state snapshot → the relay's min-frontier GC
compacts the buffer to `snapshot + tail`; the size-cap backstop is floored at the snapshot seq so it never
strands a behind-peer; fails SAFE on a marker-read error). B2 redb compaction (the file now shrinks after
GC). B3 owner room-drop on Stop-Sharing (frees the room at once, not at 14d TTL) + content-blind
`/roomz`+`/metrics` observability.

**ACTIVATION + COMBINED-TEST SEQUENCE (do in order; snapshot-and-GC stays inert until step 2):**
1. **Deploy relay B1b/B2/B3 to the Pi** (`liner.local`) from `feat/sync-robustness-b1b`. Safe to deploy
   anytime — with `snapshot_seq` never set it's a pure no-op over today's behaviour; the size-cap floor and
   compaction only add safety. Optionally set `ENLINER_RELAY_METRICS_LISTEN=0.0.0.0:9445` in the systemd
   unit to watch `curl -s http://liner.local:9445/roomz | jq` during the test.
2. **Flip snapshot activation ON:** add `RelayCapability.snapshotAndGcV1` to `RelayLocalCapabilities.current`
   (`Sources/Outliner/Relay/MembershipVaultWiring.swift`) — the ONE line held OFF in B1a/B1b (a guard test
   asserts it's currently absent; update that test when flipping). This makes snapshot PUBLISH + the relay
   FLOOR activate together, which is why the relay must be deployed FIRST (step 1).
3. **Ship a client build** with step 2, install on both Macs (dev + Home-Mac-mini).
4. **Two-Mac test** against the real LNVLT vault: verify (a) no Shared→Local revert on restart (A1/B7); (b)
   an emptied peer self-heals without a re-invite (A2); (c) the >8 MiB delta / snapshot syncs (chunking +
   snapshot); (d) `/roomz` shows the buffer bounded to ≈ snapshot+tail and `relay.redb` shrinks after GC
   (B1/B2); (e) Stop-Sharing frees the room promptly (B3 — watch `/roomz` room_count drop).


## 2026-08-01 — Sync robustness B1 design decisions (snapshot-and-GC; PROCEED-ON-DEFAULT, confirm w/ Jan)

Design: `Docs/engine-notes/sync-robustness-b1-snapshot-and-gc.md`. Three NEW policy choices (none
reopen a locked decision) taken on the simplest-safe default so B1a can proceed; flagged for Jan to
confirm — none are blocking:

- **Snapshot authority = the room owner, single-publisher.** Only the signed `MembershipDoc.owner`
  publishes full-state snapshots; enforced at the relay via `role.can_admin()` on the new `Snapshot`
  frame (B1b). Avoids duplicate multi-hundred-chunk runs + keeps the snapshot seq monotone. Cost:
  owner-offline liveness — degrades to "bounded buffer + surfaced back-pressure," strictly better than
  today's silent drop. Multi-admin snapshot handoff parked to `Docs/parking-lot.md` / multi-member work.
- **`snapshot-and-gc-v1` capability requires `crdt-chunk-v1`** (a snapshot is delivered as chunks).
  Bundled: a binary advertises snapshot-aware only where it also advertises chunk-aware; the publish
  gate checks both. Unanimity gate (any legacy peer ⇒ OFF ⇒ no snapshot/GC ⇒ today's full-history
  behaviour), same fail-closed roster machinery as `crdt-chunk-v1`.
- **Snapshot trigger thresholds = 32 MiB accumulated tail OR 512 seqs since last snapshot** — heuristic
  starting values, explicitly tunable (a `SnapshotPolicy` const-file), to be revised once B3's
  `/metrics` gives live buffer-size telemetry.

Also confirmed by the design (not a decision, a finding): **the GC floor the PRD worried about already
exists** — the relay's `ack_and_gc` already tracks per-member ack frontiers (`FRONTIERS` table) and
floors deletion at `min(frontier across current members)`, so a mid-catch-up peer is already protected.
B1's only new GC-side work is a snapshot-seq floor on the *size-cap backstop* sweep (the one path that
drops unacked data) — B1b. **Content-blind invariant (D25) preserved**; D20/D23/D27 untouched.

**Split: B1a (client publishes snapshot record; NO relay change/redeploy; delivers the compact-catch-up
win via the existing min-frontier GC) then B1b (relay snapshot-seq marker + size-cap floor; isolated
redeploy).** B1a is built; B1b builds on a relay branch but is NOT deployed to the live Pi without Jan.

- **COORDINATOR RULING — advertising held OFF in B1a; snapshotting activates only with B1b.** B1a lands
  the FULL client snapshot plumbing (publish trigger, `crdtSnapshot=0x03`, receive/apply, `SnapshotPolicy`,
  the `snapshot-and-gc-v1` capability + gate) built and tested, but `RelayLocalCapabilities.current` does
  NOT advertise `snapshot-and-gc-v1` yet — so owner snapshotting stays INERT. Why: activating snapshotting
  adds relay-buffer bytes, and the relay's size-cap backstop has no snapshot-aware floor until B1b (a live-Pi
  redeploy). Independent review found the sole genuinely-worse case is a vault whose single full-state
  snapshot exceeds the 256 MiB room cap with a persistently-behind peer — which is precisely the live
  fleet's real ~435 MB vault (LNVLT). Since B1b's relay floor won't be deployed autonomously (needs Jan),
  gating advertising off guarantees NO shipped build ever snapshots before its floor exists, at zero
  structural cost (B1b adds `snapshotAndGcV1` to `RelayLocalCapabilities.current`, flipping snapshot + floor
  on together — matching the capability-bundling intent). A test guards that `.current` does not yet
  advertise it, so re-enabling is a conscious B1b act. (Overrides the review's "advertise now" — which is
  correct for most vaults, but the regressed case lands on Jan's real live data and can't be paired with the
  B1b deploy right now.)

## 2026-08-01 — Sync robustness A1 BUILT (vault-canonical Shared state; kills B7)

Implemented Leg A phase A1 of the sync-robustness PRD (design: `Docs/engine-notes/sync-robustness-a1-
vault-canonical.md`). Shared-ness now derives from the vault's `.outliner/` (a valid, room-matched
`membership.log`) via a new PURE `VaultShareResolver.resolve(root:accountFpr:) -> VaultShareState`
(OutlineModel), NOT the device-local registry `kind`. The registry `kind` + `relay-state.json` are caches
reconciled to the vault on open (`VaultShareReconcile.decide`, OutlinerCore — vault wins, never demote on
inference). The B7 false-demote is GONE: `VaultModeMigrator.resolveInterruptedMigration`'s
`.sharedVaultMissingCRDT → setKind(.local)` branch no longer fires; a `.shared` shell missing `crdt/` is
disambiguated by membership.log presence (present ⇒ stay Shared + seed an empty `crdt/`; absent ⇒ Local).
A missing account key / corrupt log / not-a-member is `.sharedBlocked` (HELD Shared, surfaced, never
demoted). Teardown of `membership.log`/`crdt/` stays gated to explicit `freezeLocal` (Stop-Sharing) + the
copied-vault re-mint — and, per B1 below, `freezeLocal` now ACTUALLY deletes `membership.log` (deleting it
first, before `crdt/` + the kind flip) so the presence-is-authority resolver honors a completed
Stop-Sharing. Deltas from the design + the coordinator rulings applied on top:

- **B1 (inverse of B7, found in independent review; FIXED).** Because A1 made `membership.log` presence
  the SOLE Shared-authority, a completed `freezeLocal` (Stop-Sharing) that left the log on disk would be
  silently RE-SHARED on the next open (resolver → `.shared` → cache re-adopted → empty `crdt/` reseeded →
  relay reconnected). Fix: `freezeLocal` now deletes `membership.log` FIRST (before removing `crdt/`,
  before the kind flip), via a new `MembershipSidecarStore.delete()` explicit-teardown primitive. The
  Keychain RCK is still RETAINED (log ≠ key — a re-Share writes a fresh genesis log wrapping the reused
  key). Ordering gives correct crash discipline: a crash after the log-delete resolves `.local` (log gone,
  orphan `crdt/` discarded next open); a crash before it leaves a coherent `(.shared, hasCRDT)` pair that
  is safely re-freezable. Regression tests added at the resolver + migrator layers.

- **`syncTransport` clarification (design §8, D28).** A1 leaves `syncTransport` (the Local iCloud/git
  axis) UNTOUCHED and does NOT overload it for "Shared" — contra the PRD current-state table's framing.
  The real duplication B7 was about is registry `kind` vs `.outliner/membership.log`. A CLARIFICATION of
  D28's scope, not a reversal.
- **COORDINATOR RULING — legacy log-less Shared vault (design §11 open question → option (b), scoped).**
  A pre-MM vault that shared on the raw single-user RCK path and never wrote a `membership.log` (resolves
  `.local`) is treated as "legacy log-less Shared" ONLY when the registry cache is `.shared` AND a raw RCK
  is resolvable AND `vault.json`/last-known has a relay endpoint. It stands up on the raw RCK path AND
  self-erasingly writes the genesis `membership.log` (existing genesis-on-share seam), becoming
  log-canonical thereafter. The `kind` tiebreaker fires ONLY in this narrow, documented, tested case —
  never as general authority.
- **COORDINATOR ADDITION — Encrypted × Shared × LOCKED.** Added a `.sharedLocked` disposition
  (`VaultShareState.gatedForUnlock(isEncryptedAndLocked:)`, pure): the resolver reads plaintext-by-design
  sidecars and says Shared even on a still-locked encrypted vault, but the relay can't stand up without
  the dbKey to read `crdt/`. `.sharedLocked` HOLDS stand-up (surfaces "Unlock to sync", never spins,
  never demotes); stand-up fires automatically on unlock (a fresh `open()` re-derives an unlocked
  `.shared`). Confirmed the CURRENT stand-up already requires an unlocked vault by construction
  (`open()` bails before the relay code on a cancelled unlock; the mirror needs the crypto), so this
  hardens + surfaces the case rather than fixing a live spin. The RCK Keychain cache is independent of
  the dbKey unlock (separate store) — a locked vault can still hold its RCK; the only blocker is `crdt/`.

No locked decision violated (D13/D24 `kind` stays a field, demoted field→cache; D20/D27/content-blind
relay untouched — no wire/at-rest change). ~55 model+core tests + 4 app-target tests added; existing
relay/migrator/membership suites kept green. NOT committed.

## 2026-08-01 — Sync robustness direction (vault-canonical Shared state + bounded relay buffer)

END-NOTE after the first sustained two-Mac live-sync session (LNVLT 435 MB over the `liner.local`
relay). Full plan: `Docs/prds/backlog/sync-robustness.md`. The chunking fix (below) shipped in beta.5,
but the shared-vault LIFECYCLE is brittle in two ARCHITECTURAL ways (the rest of the night's jank was
transient debugging churn — build swaps, live relay pokes, mixed versions):

1. **Vault-canonical Shared state (fixes B7).** "Is this vault Shared, and how" must be derived from
   `.outliner/` — `membership.log` already carries the members AND the RCK wrapped per member (the
   "encrypted remote config" already in the vault) — NOT the device-local registry `kind`. `open()`
   self-establishes sync from the vault + unwraps the RCK via the account key (Keychain); the registry
   `kind` + `relay-state.json` become REBUILDABLE CACHES, never the source of truth. A revert must NEVER
   tear down `membership.log`/`crdt/`. Extends "files canonical at rest, index canonical at runtime" to
   sync state → kills the revert-to-Local class (B7) by construction. + a self-heal resync (frontier
   reset + re-subscribe) so an emptied/behind peer recovers without a re-invite.

2. **Relay = bounded FORWARD buffer, not an archive.** The relay holds the full delta history in a
   fixed 256 MiB/room cap and SILENTLY DROPS unacked deltas over it ("data loss for never-caught-up
   peers" — observed live in the sweep log), and redb never compacts (577 MB file that only grows).
   Fix: snapshot-and-GC (owner publishes a compacted full-state snapshot — chunked; once ALL members
   reach it, GC everything before it → buffer ≈ snapshot + tail), + redb `compact()`, + room teardown
   on Stop-Sharing, + surfaced size-cap/back-pressure instead of silent drop, + `/metrics` observability.

The three legs (A vault-canonical config, B bounded relay, C chunking — SHIPPED) reinforce each other:
no false reverts → fewer full-state republishes → less relay bloat; a snapshot buffer → cheap peer
catch-up; chunking → snapshots/large deltas fit through the per-blob cap. OPEN: account-key portability
for cross-device open (ties to key-recovery, sync-multiplayer PRD §5.6); snapshot authority + not
GC-ing below the min member frontier in multi-member. Phased A1→B3 in the PRD; each a design→code→review
pipeline. Content-blind relay invariant + D20/D27 at-rest guarantees preserved (snapshots stay sealed).

## 2026-08-01 — CRDT delta chunking + `too_large` non-fatal (large-vault sync fix)

CONTEXT: two-Mac live sync of a 435 MB / 13k-block vault (LNVLT, on the `liner.local` Pi relay) died
with a **fatal `too_large`** the moment the owner published its content — a single CRDT delta exceeded
the relay's 8 MiB per-blob cap. Only ASSETS were chunked; CRDT deltas published as ONE blob. (Distinct
from the beta.4 fix, which was the RECEIVE ceiling: `URLSessionWebSocketTask.maximumMessageSize` 1→16
MiB.) Design → code → review pipeline in flight; design at `Docs/engine-notes/crdt-delta-chunking.md`,
bug B11.

DECISION (systemic fix):
- **Chunk CRDT deltas** like assets: split blobs > 4 MiB, publish tagged `crdtDeltaChunk` records
  (`RelayRecordKind` 0x02), reassemble on receive before apply; intermediate chunk seqs acked as
  "durably buffered" so the pure machine's gap/dedup logic is UNCHANGED — the CRDT frontier advances
  only on the final chunk's reassemble+apply. Relay stays content-blind + UNCHANGED (each chunk is an
  ordinary ≤cap blob).
- **`too_large` reclassified FATAL → retryable + skip-and-log** — one oversized blob can never kill a
  session again.
- **COORDINATOR RULING (overriding the design agent's "reuse `asset-sync-v1`"): a SEPARATE
  `crdt-chunk-v1` capability.** `asset-sync-v1` already shipped in beta.1–4 WITHOUT chunk support, so
  reusing it would make a mixed-version peer loop/tear deltas. Chunk-aware peers advertise BOTH
  `asset-sync-v1` and `crdt-chunk-v1`; a delta is chunked only when EVERY peer advertises
  `crdt-chunk-v1`, else published unchunked (degrades via the now-non-fatal `too_large`). Mixed-
  version-safe — the robust choice for a *systemic* fix.
- **Seal layering: one seal per chunk** (consistent with the `crdtDelta` path); the receiver buffers
  the SEALED chunk blobs durably (plaintext never at rest), opens + concatenates at reassembly.

STOPGAP (removable once chunking ships): relay `ENLINER_RELAY_MAX_BLOB_BYTES` 8→11 MiB on
`liner.local` (systemd drop-in) — fragile, ceilinged by the 16 MiB client receive limit. Invariant to
preserve going forward: `relay_max_blob ≥ chunkSize` AND `client_maxMessageSize ≥ chunkSize × 1.37`.

## 2026-07-29 — Provenance v1 attribution granularity (accepted limit, review-shaped)

Import-side attribution stamps ONLY single-peer single-Change imports (the steady-state live
delta, where peer-level attribution is exact). Batched multi-author imports — the joiner's
full-state reseed, reconnect replay — attribute NOTHING (guard in newestImportedEdit): a fresh
joiner's blocks start unattributed and true authorship accrues from subsequent per-commit deltas +
the index's lazy refill. This avoids the reviewer-flagged mis-stamp (a reseed's newest author
stamped onto everyone's blocks). Per-op container→node mapping is the documented v2 refinement.
An existing member's idempotent redelivery imports an empty span → no-op by construction (the
feared attribution corruption cannot occur).

## 2026-07-29 — Jan ratifies the full decision stack ("Agreed and go on")

**TLS-by-default ADOPTED**: relay terminates rustls natively, self-signed cert at install, SPKI
pinning (pin rides the invite as a signed `relay_spki` field + mDNS TXT + install banner); NEW
shares are wss-only hard (dev-flag escape only), EXISTING ws vaults get the persistent warning +
one-click upgrade (the guide-don't-strand synthesis). Rollout relay-first. **MM-1 AMENDMENT
RATIFIED — `set_profile`**: a self-scoped, owner-only, signed membership op carrying a member's
self-asserted display name; private nicknames stay device-local (the "sync nicknames on verify"
alternative stays REJECTED per the B1 invariant). **Provenance v1 ADOPTED** per the PRD recs:
last-editor-per-block projection (rebuildable index columns), peermeta announced on first record,
own-edit gutter suppressed (inspector always answers), timestamps informational/lamport-ordered;
"Show Block Provenance" context verb. **History viewer ADOPTED** (v1 view+copy only, restore
explicitly out; local-oplog-sourced; fpr-floor names until peermeta/set_profile land). **Asset
sync ADOPTED** incl. insert-time downscale for pasted raster images (Jan sign-off) and the
capability-gated envelope framing (the no-corner-cut crux: framing only when the whole roster
advertises support). **D24-6 friction CONFIRMED** as shipped (typed-ack modal re-fires per open
until completed). Build wave: TLS-relay ∥ last-synced header ∥ provenance-model ∥ history-model,
then asset-sync pipelines sequenced behind provenance (membership-file contention), then the UI
legs.

## 2026-07-29 — M2-T6 `.id()`-teardown retired for LOADED remote reconciles (flicker fix)

The receiving Mac flickered on every remote CRDT delta: `Vault.importRemoteUpdate` merged surgically
at the model layer (`adoptLoadedPage` → `ingestRemote`) but signalled only a page-id `Set` via
`onExternalReconcile`, which the app folded into the editor host's `.id(EditorTarget(…tick:))` — so
the whole NSView tore down + rebuilt PER DELTA (the T1-swap-point the `DetailPlaceholderView` comment
had reserved). Fixed by **routing, not by weakening a locked decision**:

- **New granular model signal** `Vault.onRemoteApply: ([RemotePageApply])` (payload = pageID +
  post-merge `Diff`), fired from `importRemoteUpdate` for **LOADED-page adoptions ONLY**. UNLOADED
  adoptions, tombstone deletes, and external `.md` reloads keep firing `onExternalReconcile` exactly
  as before (they have no live caret/scroll to preserve — the whole-file reload is correct there).
- **In-place reconcile**: the app's editor coordinator runs the SAME `reconciler.apply(diff,
  newTree:)` a local edit runs (re-reading the freshest tree via `vault.snapshot(page:)` on the
  MainActor — mirroring how the local path derives its `newTree`), enqueued on the SAME
  `commandChain` so it never interleaves with an in-flight local echo. A remote-delta BURST coalesces
  to ONE apply + ONE paint per runloop tick (`Diff.union`). Receiving-side caret rules: capture the
  local caret pre-apply; a surviving focused block re-homes clamped to the merged length; an
  untouched block's caret naturally stays (the FOCUSED-ROW RULE). Marked-text composition defers the
  apply one tick.
- **Identity now stable across a remote LOADED apply**: `externalChangeTick` (and thus the
  `EditorTarget.tick` fed to `.id()`) fires ONLY for the whole-file reload cases; a remote LOADED
  reconcile never bumps it, so caret/scroll survive.
- **G1 model-layer adoption UNCHANGED**: the G1-6 surgical `ingestRemote` for loaded pages and the
  G1 clean-reload for unloaded pages are byte-identical; this fix only changes which app-layer signal
  a loaded adoption emits and how the editor consumes it.
- **New S2-R perf gate**: `GateMode.s2r` (`.remoteApplyBegin`→`.paint`, 16 ms p95 budget) + an
  editor-teardown counter the run asserts == 0 (a teardown means the flicker regressed). Wired
  through GateDriver / AppGateRunner / perf-run alongside `s2`/`s3`.

No locked decision (D0–D28) is reopened; D20/S7 and the G1 CRDT-as-a-layer design are preserved.

## 2026-07-29 — **FIRST LIVE TWO-MAC REALTIME SYNC** (Jan: "IT WORKS") + six live-run fixes + UI pass

The full stack proven end-to-end on real hardware: Mac1 (owner) ⇄ panic1 relay ⇄ Kyoko/Mac2
(invited member) — invite dance with cross-machine-verified safety numbers, membership push,
full-state reseed, live keystroke convergence. Six gaps found ONLY by live dancing, each fixed via
the full pipeline the same day (d22eb9a, 8d014f0, 825060f, 790c8ac, 916b52d + no-op-push fix in
review): (1) open()'s interrupted-migration heal demoted joined shells to .local — joined shells
now seed an empty crdt/ (reviewer-proven no twin-lineage fork); (2) join used the picked folder AS
the vault root — now <picked>/<name>/; (3) empty-vault re-bootstrap fatal-looped on stale_epoch —
benign-in-.creatingRoom + durable bootstrappedRoom marker; (4) re-admitting an existing member was
consumed-but-broken — idempotent re-admit, admission bound to the fresh invite, pins selected by
the admission's invite id; (5) the relay GCs all-acked blobs so late joiners replayed NOTHING —
admit now membership-pushes THEN republishes full state, and a fresh joiner tolerates the pruned
prefix (reviewer independently traced empty-joiner page materialization via pagemeta); (6) the
no-op re-admit still pushed the unchanged head → relay stale_epoch → OWNER's live sync died —
push skipped when membership unchanged + an armed membership-push rejection is surfaced non-fatal.
Invites now carry a SIGNED optional vault_name (legacy-compatible) — the invite blob is the full
self-contained token (server + room + owner identity + role + expiry + name); the RCK travels only
in the SAS-gated admission, never the invite.

**Jan-directed UI pass** (0a12e77): 20-finding presentational review implemented (footer-primary
rule, shared BlobPasteBox/BlobDisplayBox, single SAS instruction + fixed 6×2 grid, sequential
invite flow, no-raw-fpr naming, vault-name pane header, + 10 low-severity).

**Transport posture stated** (Jan asked): content E2E does not depend on the wire (RCK AEAD +
signed membership; a LAN MITM ≈ a hostile relay, which the model already assumes); today's link is
plain ws — metadata visible on the LAN, wss:// client-ready, relay-side TLS = deployment task
before any off-LAN use.

**In flight:** receiving-side flicker fix (root cause: the M2-T6 `.id()`-teardown shortcut — its
own comment reserved this "T1-swap-point"; remote applies move onto the incremental reconciler
with runloop coalescing + a new S2-R gate; G1 model-layer adoption UNCHANGED). Block-provenance
PRD drafted (full op history already survives compaction — exportSnapshot, not shallow; per-block
last-editor = rebuildable index projection; peer→account via additive peermeta map). **Awaiting
Jan:** ratify the MM-1 `set_profile` self-scoped op (member-chosen display names through the relay;
private nicknames stay device-local per the B1 invariant — "sync nicknames" considered and
rejected); provenance Q1-Q4; D24-6 friction confirm; TLS-on-panic1 task.

## 2026-07-28 — MM-6 SHIPPED (invite/join dance + Members roster) + encryption×sync gap closed; scope calls

**MM-6 shipped in two pipelines** (C: bb29579 dance; D: 5de3727 roster), Jan-directed ("I wanted to
see the realtime sync"), each through the full design→code→review→fix loop. Coordinator scope calls
on the design's deferral flags: **QR rendering and the pending-invite revoke list DEFERRED** (copy/
paste + ShareLink suffice for the two-Mac gate; `PendingInviteLedger.pending/revoke` exist when the
UI is wanted), **local nicknames KEPT** (device-local, humanizes the roster), **remove/role-change/
rotation stay MM-7**. Join entry point = File ▸ Join a Shared Vault… (a joined shell adopts room/
endpoint/content from the invite — a New-Vault radio would blank most of that sheet).

Two review-blocking finds worth recording as invariants:
1. **Resumed-join sandbox scope** — an invitee who quits mid-dance resumes via a security-scoped
   bookmark; `finishJoining` owns a balanced start/stop pair and cleanup is gated on adopt success
   (a failed adopt after a materialized shell is RETRYABLE and never discards the resume anchor).
2. **Device-local trust data must never touch the synced tree** — the verified-marks/nickname
   stores resolve ONLY to the vault's App-Support runtime dir and DEGRADE to no-persistence when
   it's unresolvable; the original `.outliner/` fallback would have let a PEER's synced-in marks
   file render members "verified" this user never verified. Invariant pinned by tests
   (never-under-vault-root + degraded-writes-nothing).

**Encryption×sync audit + fix** (cd6b2b2/bd5678c): encrypt-after-share left the `crdt/` Loro log
(a full ops-level content copy) PLAINTEXT inside a sealed vault — `VaultConverter` now seals/
unseals `crdt/` in lock-step with the toggle (idempotent, inside the existing `.converting` marker
discipline; seal-if-present deliberately kind-agnostic). Open-time mirror store selection was
already encryption-aware (pinned by test). BY-DESIGN cleartext, now documented in the encryption
PRD §5.3a: `membership.log` (pre-unlock relay stand-up), `relay-state.json` (device-local cursor),
`vault.keyring` (the envelope itself). GUIDE-not-block copy added both directions (encrypting a
shared vault / sharing an encrypted one); RCK-vs-VCK independence confirmed — at-rest encryption
is a PER-DEVICE choice, members never need each other's VCK.

Also shipped this evening, Jan-directed: D24-5 rework (902916b — shared vault's Sync Server section
locked read-only behind a frictioned Change Server… destructive confirm; persisted-endpoint
recognition + verbatim port rendering fixed) and migration-job metrics (a4de512 — pages/blocks/
seed-bytes/stage-timings/relay on Job Center migration rows; session-scoped by design, the type is
Codable for a future durable history).

**Live validation state:** owner side driven end-to-end on Mac1 via GUI (real invite generated,
ledger durable); Kyoko (Mac2) deployed + running the same build, but Sequoia's TCC makes remote GUI
driving impossible without one-time on-screen consent — the first full two-Mac dance is queued for
Jan's morning (invite pre-loaded in Kyoko's clipboard, 48 h validity). Review directive for that
run: exercise one quit-and-relaunch-mid-dance resume on the invitee side (the one path headless
tests can't fully prove under sandbox).

## 2026-07-28 — MM-5 amendment: the relay doc `epoch` is a MEMBERSHIP-DOC staleness counter (chain
length), decoupled from the RCK epoch — design §2's "doc epoch = highest RCK epoch" was internally
inconsistent with PROTOCOL.md

Design §2 says the relay doc's `epoch` equals the highest RCK epoch, and §3 says an `add_member`
mints NO new RCK epoch ("add = a stanza"). But PROTOCOL.md's `update_membership` requires the new
doc's `epoch` to be STRICTLY GREATER than the stored one — so an add-only membership change (the
entire MM-5 invite flow) could never be pushed: the head would carry the unchanged RCK epoch and
the relay would reject it as `stale_epoch`. The two rules cannot both hold as written; the relay's
`epoch` is a staleness guard on the DOC, and what it actually needs is monotonicity per membership
change — not key-rotation semantics.

**Adopted:** `MembershipLog.materializeHead().epoch` = `relayDocEpoch` = the verified chain's
LENGTH — strictly monotonic on every appended entry, deterministic from the log (all peers compute
the same head; rule-3 head-consistency intact), and equal to the previous value (1) for a genesis
head, so the bootstrap wire bytes are unchanged. The RCK epoch is untouched: it remains
`MembershipLog.epoch` / the `RCKKeyring` fold, carried inside the log entries; members learn it
from the log, never from the relay doc. One MM-1 test assertion updated (post-remove head epoch:
was the RCK epoch 2, now the chain length). Zero relay-repo CODE changes; it is the design doc's
§2 sentence that is amended.

**The ack-shape consequence (client-side, review-corrected):** the production relay acks an
`update_membership` with `ack_ok{room, seq: <new doc epoch>}` (protocol.rs `AckOk` — `room` is
NON-optional on every ack; PROTOCOL.md documents the room on all acks), byte-shape-identical to a
publish confirmation. The wire therefore CANNOT discriminate the two; misreading a membership ack
as a publish confirm would overwrite `publishedSeq` with the doc epoch and pop an unconfirmed
inflight cursor. The client machine disambiguates by an ARMED EXPECTATION: the consumer feeds
`.membershipUpdateSent(epoch:)` after sending the frame (epoch decoded from the pushed head's
exact signed bytes); the first `.subscribed` ack matching the armed epoch is the membership ack
(disarmed, inert), all others are publish confirms. Send-order ack FIFO keeps this sound even when
a publish seq numerically collides with the doc epoch; the expectation drops with
`inflightCursors` on any exit from `.subscribed`. The FakeRelayServer acks room-carrying, verbatim
the production shape.

Phase-1 gaps (documented in code, carried to MM-6+): an OFFLINE admit's push must be re-invoked
once live (no auto-reconcile against the relay's advertised epoch yet); the pending-invite ledger
is single-device (invites redeemable only via the issuing device); the admission log travels as a
third OOB hand-off until the CRDT log mirror lands.

Also MM-5 (additive, same discipline as MM-2's signing-pubkey fold): membership payloads now
carry the member's `account_encryption_pubkey` on `create`/`add_member`, fpr-cross-checked at fold
time (`accountKeyMismatch`), because the owner's admit step must re-wrap the current-epoch RCK to
ALL present members from the log alone. Pre-MM-5 chains stay valid; a member recorded without the
key makes an admit fail loudly (`memberEncryptionKeyMissing`) rather than wrap to a subset.

## 2026-07-28 — FLAG-1 amendment (MM-2, coordinator-adopted): the account identity is a KEYPAIR PAIR

The design's FLAG-1 specified a single non-signing X25519 account key. That shape cannot deliver
its own goal — a new own-device joining with no existing device online must PUBLICLY prove account
ownership in the append-only log, and X25519-only permits only designated-verifier proofs (wrong
for a log). Adopted the standard Keybase/Signal shape: **account identity = Ed25519 signing +
X25519 encryption, minted together, both iCloud-Keychain-synchronizable** (AccountKeyStore, pair-
atomic — a half-present sync race re-mints both, never a mismatched identity split). Fingerprint +
SAS remain defined over the X25519 key ONLY — byte-stable with MM-1's vectors; the signing pubkey
rides additively in create/add_member payloads (registered once, immutable thereafter; MM-1-era
chains stay byte-identical and fully valid). add_device now authorizes via an existing active
device OR the account signing key. Adversarially reviewed clean.

## 2026-07-28 — Jan rules BOTH decision slates "all recommended" (D24 F1-F6 + multi-member FLAG-1..8)

**D24 sharing surfaces (Docs/prds/in-progress/d24-sharing-surfaces.md), F1-F6 as recommended:**
ACKNOWLEDGE matches case-insensitively (F1); create-Shared never blocks on unreachable relay — 3s
advisory probe only (F2); Stop Sharing warns-but-allows on unacked changes (F3); cloud-placement
gate/banner applies to SHARED vaults only (F4); warning copy lands as proposed, revisable (F5);
rail connection dot deferred to the sync PRD's badge work (F6). D24-4/5/6 unblocked.

**Multi-member vaults (Docs/prds/backlog/multi-member-vaults.md), FLAG-1..8 as recommended:**
**FLAG-1 = Model A-HYBRID** — per-device Ed25519 signing keys (ThisDeviceOnly, as shipped) + a new
per-user synced NON-SIGNING X25519 account key that groups devices, self-certifies new own-devices,
and is the fingerprint-verification + RCK-wrap target; membership doc lists devices grouped by
user; per-device revocation. FLAG-2 = sidecar-canonical membership log (.outliner/membership.log)
mirrored into the CRDT; relay keeps getting only the materialized head (contract unchanged).
FLAG-3 = wrap the RCK to per-user account keys (one age stanza per user). FLAG-4 = new members
bootstrap by current-epoch full snapshot, join-forward. FLAG-5 = OOB-first invites; the relay
invite-room is a deferred Phase-3 relay-repo stream. FLAG-6 = Phase 1 uses signed invite blob +
SAS comparison, NO new PAKE dependency; SPAKE2 only if/when the live rendezvous is built.
FLAG-7 = single-use invites with a 48h default expiry. FLAG-8 = recovery admins may re-key/
re-admit EXISTING members only — never add/remove, never designate further admins.
MM-1+ build unblocked (Phases 1-2 require zero relay changes).

## 2026-07-28 — **G2 APP-SIDE GATE GREEN**: live two-instance sync through the real relay

The full G2 chain (G2-0..G2-5, each design→code→review→fix) landed through ecae788 + the live gate.
**Coordinator-run live result (direct ws://panic1.local:9444/sync): A→B 0.105s, B→A 0.103s,
concurrent same-block char-merge 0.106s (G1 oracle: both edits + original survive, identical both
ends), suite 1.2s.** Two full Vault stacks, distinct Ed25519 identities admitted by a provisioned
two-member membership doc, every blob sealed under the shared per-vault RCK (encryption evidence
in-test; authoritative no-plaintext byte-scan in the Tier-B fake-relay suite). Skips offline.

The live gate caught and fixed two real defects en route: (1) the relay ENFORCES membership on
subscribe and rejects silently at info level — a non-member's subscribe just vanishes (documented;
Tier-B follow-up: FakeRelayServer does not yet enforce membership on subscribe — fidelity gap
noted, not churned); (2) mirrors are seeded ONLY by share-time migration — a load()ed-over-fresh
crdt/ mirror is empty and per-page self-heal then forks twin lineages across instances (observed
live, reproduced offline); transport fixtures MUST run the production-faithful seed path
(documented in the test header as the required pattern). Also: unbounded test waits are banned in
live suites — a blocked run now fails in 10s with the exact cause, not a 20-minute wedge.

Remaining before "shippable feature" (unchanged): D24 surfaces, external-edit review-surface UI,
ACKNOWLEDGE nested-sync guidance UX, multi-member keyring + invite (design doc next), key-recovery
implementation per Jan's iCloud-Keychain ruling.

## 2026-07-28 — Jan's morning rulings on the CRDT-frontend decision slate

Walked through with Jan; recorded verbatim-in-spirit:
- **Ratified**: (1) D23-as-realized (CRDT-as-a-layer / CRDTMirror; tree canonical at runtime, Loro
  at rest); (2) the DeltaTransport seam beside SyncTransport; (3) the two-key identity model
  (user-level Ed25519 relay identity ≠ per-vault X25519 vault identity); **(4) device-local
  relay-state / never-synced ack cursor — RATIFIED after the stakes walkthrough** (silent
  delta-skip + premature relay-GC hazards understood). The full slate is now ratified.
- **Nested-sync posture (RULED, post-research — see
  Docs/engine-notes/sync-nesting-and-invite-licensing-research.md)**: **GUIDE, DO NOT ENFORCE.**
  CRDT/Shared vaults are strongly pushed out of cloud-managed folders (iCloud/Dropbox/Google
  Drive/OneDrive, detected via isUbiquitousItemKey + CloudStorage heuristics) with a MULTI-STEP
  warning UX — the final step requires the user to literally TYPE "ACKNOWLEDGE" into an input
  field (defeats instinctive OK-clicking) — but the app never disallows the placement. Applies at
  creation/open + a runtime detector for vaults moved into cloud folders later.
- **Invite/membership (ADOPTED as direction, per the research recs)**: the TOFU +
  fingerprint + owner-signed append-only membership doc flow (wormhole-style one-time PAKE invite
  codes; Signal-register verification — hard-gate only on key CHANGE of a verified member;
  own-device continuity via synced Keychain, cross-user admission always via explicit invite).
- **KEY RECOVERY (ruled, reverses the coordinator lean)**: **iCloud-Keychain-synced identity +
  optional designated recovery admin for team vaults; NO recovery phrase** ("recovery phrases
  don't work in practice — people lose them"). Note: RT-1's relay identity is deliberately
  ThisDeviceOnly; implementing this ruling means a second syncable key class / policy switch —
  design it into multi-member, not as a retrofit.
- **Creation & settings surface (ruled)**: Shared offered AT CREATION and as upgrade-in-Settings;
  relay coordinates entered as part of the flow and **saved per-vault** (different vaults may use
  different relays; `VaultSettings.relayManualEndpoint` from RT-4 is the existing home). A relay
  settings surface is required (server picker + persistence).
- **Invite/membership direction**: Signal-style TOFU link + fingerprint verification, "very low
  level, very robust". Design brief + prior-art research commissioned before any build.
- **G4/managed relay direction**: own sync server eventually; multi-tenancy possibly via strong
  per-customer isolation (e.g. container-per-customer). Post-validation, unchanged.
- **Crash root cause**: Jan acknowledges it is NOT definitively known; watch item stands.

## 2026-07-28 — **G1 GATE GREEN** (sync PRD §5.7): the Loro CRDTBackend ships for Collaborative vaults

All G1 sub-tasks (G1-0..G1-9, incl. Jan-ruled G1-7) landed on main through b23d03e, each via the
design→code→review→fix pipeline. **Gate criteria, coordinator-verified:**
- **Two-instance convergence via delta exchange** — VaultRemoteConvergenceTests + surgical-ingest
  suites: disjoint edits, same-block char merges, concurrent reparents (movable-tree identity
  preserved through the real record() path), remote-not-undoable, durable across relaunch.
- **Migration round-trips both directions with identity** — VaultModeMigratorTests: byte-exact
  parity (independent parse→serialize oracle) + every ULID preserved; crash-discipline both
  directions; freeze refuses non-reprojected vaults.
- **S1 holds on a Collaborative vault** — G1-9 measured live: mirror-load delta ~127 ms vs the
  300 ms ceiling (S1 spec 1,500 ms); editor readiness unaffected (~1.8 ms).
- **Headless suites green** — full battery ×3 consecutive: 2,286 XCTest + all swift-testing suites,
  0 failures, both runners.

**Honest caveat, logged:** a full-suite-parallelism heap-corruption flake surfaced at G1-7's commit
(bisect clean pre-G1/at-G1-8; frames misattributed; TSAN clean; leading theory = latent
.v5/@unchecked-Sendable Loro-FFI region exposed by suite growth). Mitigated empirically
(@Suite(.serialized) on two storm suites → 0/3 crashes). **Hard preconditions before relay/G2 app
wiring ships:** (1) enforce LoroCRDTMirror single-owner in the type system (actor-ize or serialize
doc access); (2) transport adapters route mirror access through the owning Vault actor; (3) no test
touches mirror internals off-actor. Also still open from the G1 stream: pagemeta covers
name/filePath/title/frontmatter only; held-external-edit records don't auto-expire (app-layer
follow-on); iCloud+CRDT co-tenancy untested (two-transport soak).

## 2026-07-27 — CRDT frontend build start (RT-0..RT-4 + G0/G1): design rulings logged for Jan's ratification — **PROPOSED, coordinator-adopted to unblock the build**

Jan directed the CRDT-PRD frontend build (relay G2/G3 already shipped + live on the LAN). Two Opus
design agents produced the transport-client and G1-CRDTBackend designs; the coordinator adopted the
following rulings (all flagged, none silently divergent). Full designs in the session records; the
relay transport is landing as commits RT-0..RT-4.

**A. D23 realization — CRDT-as-a-layer, not a literal `VaultBackend` protocol (the big one).**
The PRD's assumed `VaultBackend` seam was never built; forking the ~5,800-line `Vault` actor behind
one would duplicate cache/index/undo/routing machinery both modes must share identically. Adopted
shape: `Vault` holds an optional **`CRDTMirror`** (protocol in OutlineModel, no Loro types; conformer
in a new `OutlineCRDT` target wrapping loro-swift). **`OutlineTree` stays canonical at runtime; the
Loro doc becomes canonical AT REST for Collaborative vaults** (`.md` projected, tree rebuilt/merged
from Loro). This narrows D23's "CRDT canonical" wording while honoring its intent (auto-merge,
projection, movable-tree). Also noted: D20's 2026-07-18 reversal makes the PRD §5.2 Peritext-marks
plan moot — block content is one source string → one `LoroText` (a simplification, PRD is stale
there). loro-swift pin is **1.8.1** (PRD's 1.13.3 tag does not exist); requires a `.v5`-language-mode
sub-target (quarantined in `OutlineCRDT`).

**B. Relay transport = a new `DeltaTransport` seam BESIDE `SyncTransport`, not a new
`SyncTransportKind` case.** `SyncTransport` is a file-store decorator (right for iCloud/Git); the
relay is an ordered opaque-delta stream with no file identity. Relay selection keys off vault
`kind == .shared` + endpoint config, not `syncTransport`. iCloud path untouched.

**C. Transport decisions (all shipped in RT-0..RT-4):** (1) separate **user-level Ed25519 relay
identity** in Keychain — the D27 vault identity is X25519/KeyAgreement and cannot sign; two-key model
(sign vs encrypt) pending Jan's one-line confirm. (2) **Relay room id = the iCR-1 vault runtime ULID**
(re-mint-on-copy is semantically right for rooms). (3) **`relay-state.json` is device-local** (app-data
runtime dir, never `.outliner/` — a synced lastAppliedSeq would make devices skip deltas). (4) No
transport-owned durable outbound queue — the `DeltaSource` (CRDT) replays from a cursor; at-least-once
delivery is a stated `DeltaSink` precondition (Loro import is idempotent). (5) No
`com.apple.security.network.multicast` entitlement (brokered Bonjour browsing needs only the Local
Network grant) — verified in RT-4.

**D. External-`.md`-edit policy in a Collaborative vault (G1-7) — RULED by Jan 2026-07-27:
"let's go with option A, import as ops … We'll be warning. Be careful."** Adopted as
**import-as-ops WITH a safety floor + a user-facing warning**: an external edit to a projected `.md`
is validated (well-formed parse; ULIDs present and matching; no pending/expected remote frontier
that explains the diff) and imported as first-class Loro ops, then the file re-projects to canonical
form. Low-confidence edits are NOT imported — the external bytes are preserved as a conflict copy
(the existing iCloud conflict-file pattern) and the projection is restored; nothing is ever silently
discarded and garbage never fans out to peers. The collaborative-vault UX carries a warning that
hand-editing shared vaults is merge-mediated. Hard test case: a peer's projected `.md` arriving via
a file channel BEFORE its CRDT delta must produce zero duplicate ops.
**UX amendment (Jan, same day): an external-edit REVIEW SURFACE**, two-tier off the same floor —
high-confidence edits auto-import with a passive review card (block-level change list + **Revert**,
where revert = inverse *forward* ops); low-confidence edits get an interactive **Merge / Keep as
conflict copy** prompt listing the per-ULID diff (never silent either way). A per-vault
"always ask before merging" setting promotes tier 1 to the prompt; while an ask-first merge is
pending, projection writes for that page hold, and any concurrent local/remote change to the page
auto-degrades the pending merge to conflict-copy. Housed in the Job Center (banner + drawer row,
crash-recovery-banner precedent); the frontier check keeps peer-projection arrivals out of the
surface. Model-layer hooks land with G1-7; the surface itself is an app-layer follow-on sub-task. Also G1's `crdt/`
vault-root directory is a `format.md` layout amendment (will land WITH the G1 persistence sub-task,
not before). Freeze (Collab→Local) requires a fully-synced precondition — relay-era quiesce step noted.

**Status: PROPOSED, owner Jan.** On sign-off: fold A into D23's row, B–C into the D25/D26/D28
constellation as appropriate.

**Update (same day): G0 gate GREEN.** The Loro spike (`LoroSpike/`, committed as gate evidence per
the iC0 precedent) passed all gates on **loro-swift 1.8.1** pinned exact (the PRD's 1.13.3 is the
Rust-core/JS version; no such Swift-binding tag exists — the binding lags the core, a noted maturity
signal). T1 API surface: movable tree + checkout/frontiers/diff + export/import all reachable from
compiled Swift. T2: concurrent same-node reparent AND move-vs-delete converge with no duplicate, no
cycle (the case Automerge degrades on). T3: 10.2k-node fixture → ~598 KiB snapshot, 0.9 ms cold
import + 59 ms first full read in release — a ~60 ms slice of the ≤1,500 ms S1 budget. T4: 1:1
block↔line mapping held through ops. **Committed to Loro; Automerge fallback stays parked.** Binding
notes for G1: requires `.v5` language mode (quarantined in the planned `OutlineCRDT` target);
`ValueOrContainer.asValue()` papercut; 355 MB prebuilt XCFramework (cache for offline builds).

## 2026-07-27 — D28 **ADOPTED** (Jan): "we tested extensively and so I am approving it"

Jan approved D28 on 2026-07-27 after the iC1 two-Mac hardware gate validated the iCloud transport
live (convergence, conflict surfacing, sign-out freeze). Row **D28** added to
`Docs/specs/decisions.md` §2. One clarification folded into the row per the CRDT-frontend build:
the relay path is a separate `DeltaTransport` seam beside `SyncTransport`, NOT a new
`SyncTransportKind` case (see the CRDT-frontend entry above). Original proposal follows.

## 2026-07-27 — PROPOSED D28: a sync-transport axis on D23's Local (FileBackend) backend — **awaiting Jan's sign-off** *(superseded by the adoption entry above)*

Building iC1 (the iCloud sync transport, PRD `Docs/prds/in-progress/icloud-sync.md`) surfaces a
decision the PRD §6 flagged as "additive, Jan-level, likely a new **D28** once ruled" and explicitly
told the implementer **not to self-ratify**. Logging it here as PROPOSED; **nothing is adopted until
Jan signs off.**

**Shape.** D23 frames a vault's choice as a **backend** (`FileBackend` = Markdown-canonical, vs
`CRDTBackend` = Loro). iC1 adds an orthogonal **`SyncTransport` axis** to the `FileBackend`:
`none` (default, local-only — today's behavior), `iCloud` (Apple ubiquity over an i2 folder), `git`
(reserved, unbuilt). Persisted as `VaultSettings.syncTransport` in `vault.json`. This is the concrete
form of Qi-B (resolved 2026-07-25: iCloud ships as the first sync transport, before Git).

**Also formalizes the D6 refinement** already shipped by iCR (2026-07-25): runtime state (index,
vectors, jobs, viewstate) relocated to app-support for ALL vaults, keyed by `.outliner/identity.json`.
That refinement was logged at iCR time; D28 just records that the transport axis depends on it (the
index must not ride the sync channel).

**Invariants (nothing reversed — all additive):** D20 preserved (Apple moves the same `.md` bytes);
S7 preserved (extended across devices when materialized); D13 preserved (i2 = a security-scoped
bookmark, zero entitlement); D9 extended (iCloud external writes reuse the clean-reload / conflict-file
floor); D27 preserved (encrypted vault → ciphertext travels unchanged). No locked decision's direction
changes; this is a new capability row, not a reversal.

**Status: PROPOSED, owner Jan.** iC1 code implements the `syncTransport` field + transport seam but
does not treat D28 as ratified. On sign-off: add row **D28** to `specs/decisions.md` (§2 table) and
date-stamp adoption here.

## 2026-07-26 — Schema additive perf fix: index `pages.file_path` + a `normalized_name` column (Fable, perf-hardening)

Two hot page-lookups did full `pages` table scans. Fixed with two **additive** migrations to the
locked schema (`database.md` updated first, per §2.7; then `Schema.swift`):

- **Migration v7** — `CREATE INDEX idx_pages_file_path ON pages(file_path)`. `pageID(forRelPath:)`
  (external-change reconcile + cold-open delete check) probed `WHERE file_path = ?` with no index →
  full scan on every reconcile. Purely additive; SQLite backfills the index automatically; no
  write-path change.
- **Migration v8** — `ALTER TABLE pages ADD COLUMN normalized_name TEXT` + an index on it. Name-based
  resolution (`realPageID`/`resolvePage`/`pageID(forName:)`/`realPageIDs`) previously fetched ALL real
  pages and NFC+lowercased every row in Swift, because SQLite's `NOCASE` folds ASCII only while D8
  requires full-Unicode case-insensitivity — O(pages) per `[[wikilink]]`/`#tag` ref, multiplied across
  a link-dense block on a large vault. The column stores `PageIdentity.normalize(name)` (NFC then
  lowercased — the SAME function used at query time) so lookups probe `WHERE normalized_name = ? [AND
  file_path <> '']` against the index. It is written on EVERY `pages` INSERT/UPDATE that sets `name`
  (`replacePage`, `upsertPageMeta` both branches, `materializePage` placeholders) from that same
  normalize, so it is never stale. UNLIKE `audio`/`marks`, `normalized_name` IS derivable from the
  existing `name` column, so the migration **backfills it in place** (iterate every `pages` row,
  compute `normalize(name)` in Swift, `UPDATE … SET normalized_name = ?`) — no D23 content-version heal
  needed, and `Vault.indexContentVersion` is left untouched.

**Invariant (schema change → highest care):** resolution results are byte-for-byte identical to the
pre-change behavior — the stored `normalized_name` and the query-side key are both
`PageIdentity.normalize(...)`. The existing `IndexTests.incremental_equals_rebuild` parity property
(an incrementally-built index must dump-equal a full rebuild) is the guard and stays green. Both
migrations are one-way, additive, and safe on an existing v6 DB (v8's backfill populates old rows;
placeholders get `normalized_name` too, since they are matched by name). No `decisions.md` locked
decision is reopened — D8's normalize rule is unchanged, this only makes it indexed.

## 2026-07-25 — iCR foundation for iCloud sync BUILT (Fable, autonomous run; Jan away)

The dependency-free foundation of the iCloud-sync PRD (`prds/backlog/icloud-sync.md`) is built and
committed on `claude/icloud-sync-build` (`84123a8`…`0f5c3e1`), each sub-task run through the CLAUDE.md
pipeline (design → code → review → fix → verify → commit; every commit gated on `swift test` + app
`xcodebuild` + `perf-run` regression):
- **iCR-1** — injectable vault runtime directory + `.outliner/identity.json` id; NEW vaults put
  runtime state in app-data; existing vaults byte-identical (deferred to iCR-3).
- **iCR-2** — the semantic reindex is now a **durable `JobKind.semanticReindex`** on the one
  TransferCenter-backed Job Center (the ephemeral index-feed retired; wire-format v1→v2).
- **iCR-3** — one-time, crash-safe, encryption-aware, **lockout-proof** migration of existing vaults
  to app-data (id-agnostic re-runnable trigger; canonical sidecars never touched; `!encrypted`
  structural guard for converting vaults; jobs.sqlite never lost).
- **iCR-4** — encrypted vaults' **sealed blobs** relocate to app-data (byte-copy + streaming-SHA
  verify, never unseal; decrypt writes plaintext to the runtime dir; keyring/DECRYPT.md untouched).
- **iCR-5** — guided import step-through UX (observe cold-reparse progress; non-blocking semantic
  hand-off to the Job Center); **moved** the semantic Build control Assistant → Settings ▸ Vault.
- **iCR-6** — spec amendments: `format.md`, `decisions.md` D6/D4, `database.md`, `vault-encryption.md`.

**Two items for Jan:** (1) the Assistant → Settings ▸ Vault semantic-control **move** touches the
shipped Settings pass — trivially revertible if unwanted. (2) A **pre-existing** `OutlinerAppTests`
compile break (`LinkedRefsCoordinatorCaretTests`/`EditorSurface`, commit `7acd091`, predates this
run) blocks running the app-target test bundle — unrelated to iCR, worth a separate fix.

**NEXT (needs Jan + live-iCloud/two-Mac hardware):** iC0 ubiquity spike, then iC1–iC3 (the actual
sync transport, the D9-conflict-file reconciliation floor, iCloud carrier for Loro). No code until
iC0's compiled evidence clears its gate. Owner: Jan (hardware + go/no-go), Fable (build).

## 2026-07-25 — iCR-2: semantic reindex unified onto the durable Job Center (TransferCenter)

The whole-vault semantic reindex is now a first-class, crash-durable `JobKind.semanticReindex` job on
the process `TransferCenter` — the SAME engine that drives model/voice downloads. There is now exactly
**one Job Center** and one representation of the reindex: the ephemeral `SemanticIndexStatus →
JobCenter.setIndexEntry` Combine feed (plus its `setIndexActionHandler` routing) is **retired**, so the
reindex row is produced by the download-source adapter (`JobCenterAdapters.entries(from:)` emits an
`.index`-kind "Semantic index" row for a `semanticReindex` job) — no more parallel path, no double row.
`SemanticIndexStatus` **stays** as the Settings ▸ Vault status-line source; it just no longer feeds the
drawer. Explicit triggers (enable-toggle ON, Settings Rebuild, iCR-5 import "build now", copied-vault
re-mint) call `VaultController.enqueueSemanticReindex()`, which coalesces per vault; NOTHING enqueues on
plain vault open (JC4). The app-layer runner (`SemanticReindexRunner`, dispatched via `CompositeJobRunner`)
holds only `@Sendable` closures captured from the `@MainActor` controller — never a raw controller
reference — so OutlinerCore's `TransferCenter` stays MLX/AppKit-free (CLAUDE.md §2.1).

This reverses the `EmbeddingIndexer` header's earlier "why NOT the durable job engine" reasoning **only
for the enqueue affordance + one-engine unification**: the durable *descriptor* provides the import/enqueue
hook and Job-Center visibility, but the *work itself* remains self-resuming via `vectors.sqlite` staleness
(each upsert its own txn; a crash leaves embedded blocks fresh, the rest stale). Cross-session resume is
scoped to the live/open vault — a persisted descriptor for a vault that isn't the one being opened is
dropped at reconcile and re-triggered cheaply by staleness next time that vault is open.

Adding the `semanticReindex` `JobDescriptor` case changes the registry Codable wire shape, so
`TransferRegistry.currentVersion` bumped **v1 → v2**. The `TransferRegistryStore.load()` version guard runs
before case-decoding, so an old v1 blob (pre-iCR-2 download queues) degrades to `.empty` across the upgrade
— acceptable (the model stores re-scan; the next durable enqueue rewrites at v2). No `Docs/specs/decisions.md`
D-number is reopened; this records the implementation choice.

## 2026-07-25 — D6 REFINED: runtime state relocates to app data for ALL vaults; iCloud sync is file-based (Jan)

Resolving the iCloud-sync design study (`prds/backlog/icloud-sync.md`), Jan ratified a set of
calls that refine **D6** and scope the iCloud transport:
- **D6 refinement — index/runtime state lives in app data, not the vault.** For **every** vault
  (not just iCloud), the runtime SQLite (`index.sqlite`, `vectors.sqlite`, `jobs.sqlite`) and
  `viewstate.json` relocate from the in-vault `.outliner/` to a local-only app-support dir
  (`~/Library/Application Support/<bundle>/vaults/<vault-id>/`). The vault folder becomes purely
  portable canonical data (`pages/`, `assets/`, `snapshots/`, `vault.json`). This kills the
  synced-SQLite corruption hazard at the root for *any* sync tool (iCloud/Dropbox/Syncthing) with
  one code path. Safe because D6 already declares the index rebuildable/derived; S7 untouched.
  **`.outliner/` remains** in the vault holding the canonical must-sync sidecars (`vault.json`,
  `vault.keyring`, `encryption.json`, root `DECRYPT.md`) — only rebuildable runtime leaves. Vault
  identity is a **new `.outliner/identity.json`** (`id` ULID + `formatVersion`), *not* a field in
  `vault.json` (old builds silently drop unknown `vault.json` keys → would orphan the index).
  Copied-vault ID collision re-mints; synced two-device migration adopts the surviving id; orphan
  app-support dirs are aged-out (respecting D24 "unregister ≠ delete files"). Full crash-safe,
  file-type-aware (encrypted vaults = sealed blobs) migration in `icloud-sync.md` §4.10. Amends the
  LOCKED `format.md` `.outliner/` layout + D4/D6 rows + `database.md` + `vault-encryption.md` path
  table in the iCR commit.
- **Semantic vector index recomputes per device**, never synced (a 2.5 GB binary SQLite over
  iCloud is a corruption/quota hazard). Offered on vault open + as a first-class **import** step
  (progress-tracked Job-Center job), never blocking S1.
- **iCloud sync is file-based, full stop** — the **CloudKit / Notes-Bear records model is killed**
  (dominated: its merge is redundant with the block-ID merge we build anyway, CKShare is worse
  than the Loro relay, and it costs a second persistence layer that fights D27).
- **No version history for iCloud vaults** — Git is the history transport (the "snapshots" history
  option was a misread; `snapshots/` are web captures, not page history).
- **Solo/collab line is absolute:** iCloud = your own devices, one Apple ID; any other *person*
  (read-only *or* write) is **CRDT/Loro** — a read-only peer emits no ops, so no sharing is built
  on iCloud.

- **Qi-A → i2**: an iCloud vault is just a folder the user placed in iCloud Drive (zero
  entitlement, D13); the i1 app-container is *pinned as a later reliability tier*, not built now —
  the §4.3 index relocation + coordinated access are the bet that buys i1's reliability cheaply.
- **Qi-B → yes**: iCloud ships as the first sync transport, **before** Git.
- **B2 (conflict reconciliation) → ship Option C**: on `NSFileVersion` divergence, keep the local
  version under the canonical name and materialize the other as `Name (conflict <date>).md` + toast
  (pure D9, extended to the iCloud trigger); structural conflicts land on the same floor. **No merge
  base needed.** The 3-way block-ID merge (**Option A** — a device-local shadow base in app data,
  never synced, conservative auto-resolve, D9 fallback on ambiguity) is **pinned as a fast-follow**
  (iC-M), inserted only when latency/field data show the conflict floor fires too often. Rejected
  Option B (per-block clocks / CRDT-lite in Markdown) — wrong layer, that's the Loro path.

The core iCloud-sync design is now settled (i2 file-based · index-in-app-data · no history ·
solo-only · D9 conflict floor). Remaining are deferred UX/policy calls only (eviction/keep-resident,
vault-type create UX for D24, privacy copy) captured as §9 open questions; account/availability
states are designed in §4.9. Owner: Jan (calls), Fable (design study). No code yet — PRD parked.

## 2026-07-25 — Settings pass SHIPPED: sidebar shell supersedes SUI-2; Vault Properties → Settings (Jan)

The platform-standard Settings pass (`prds/shipped/settings-ui-native.md`) shipped, growing past its
original conformance scope during Jan's live review:
- **Shell = System-Settings sidebar** (`NavigationSplitView` + colored icon tiles), **superseding
  SUI-2**'s fixed-size `TabView`/`paneWidth`/`paneHeight` — the sidebar + independently-scrolling
  detail retire the per-tab-height problem. Stays in the `Settings{}` scene (Jan accepted the OS
  "Enliner Settings" title-bar text + non-resizable window rather than a dedicated `Window`).
- **Vault Properties unified into Settings** — a new **Vault** pane (active vault's Details +
  encryption) replaces the standalone `VaultPropertiesView` sheet; the rail's right-click "Vault
  Properties…" now opens Settings ▸ Vault via `@Environment(\.openSettings)`, switching to that vault
  first if it isn't active (so the whole window describes one vault). Sidebar selection is shared UI
  state on `VaultController.settingsSelection`.
- Assistant graceful loading (spinner, no pop-in); Encrypt guide markdown fix + "Warning" step +
  inform-not-enforce passphrase checklist (NIST SP 800-63B: length-led, never gates).
Commits `0c159e6`…`4b34efa` on `main`; builds + `swift test` green. Owner: Jan.


## 2026-07-24 — Settings pass scope EXPANDED: IA + copy + semantics (Jan-approved)

After the platform-standard native pass began, a UI-quality + settings-semantics review (Fable) found
that a native repaint alone leaves three structural problems: Assistant-tab IA (9 sections, 3 of them a
model-acquisition workflow), footer copy (verbose, states defaults, one leaks literal backticks), and a
handful of dishonest/dead settings. Jan reviewed and **approved expanding the pass beyond
presentation-only** to include: the Assistant **full IA restructure** (9→6, model acquisition → an "Add
Model…" sheet, Compute-budget+Lifecycle → "Performance"); **four naming changes** (tabs Voice
Models→Transcription, Editor Style→Editor; engine items → Automatic/Apple Speech/Whisper; "Load on
start"→"Load model at launch"); **prompt-library autosave** (drop the "Save changes" button — a behavior
change); and semantic cleanups (footer copy rule, section merges, scope + effective-engine + activate-
flips-engine disclosure footers, delete dead "Memos location" row / disabled 1-option embedding picker,
fix the max-tokens slider `1…32768`→`128…32768` dead-zone bug). Full decision record in
`Docs/prds/in-progress/settings-ui-native.md` §1a (Amendment A). This relaxes that PRD's original "no IA
surgery / no new semantics" non-goal; what a setting *does to your data* is still unchanged. Owner: Jan.

## 2026-07-24 — REVERSE the LL8 design-language carve-out for Settings chrome (Jan)

Jan reviewed the Settings window (full UI audit, all five tabs, screenshot-confirmed) and set the
north star: **"the best platform standard, really well executed. Nothing super special."** That
directive reverses the **LL8 coordinator call of 2026-07-13** ("Design-language scope"), which had
conformed the LLM Settings pane to `design-language.md`'s `{11,12,14,18}` type ramp + ink/accent/amber
hue families and sanctioned `controlBackground` card containers as Settings chrome.

**New rule:** a Settings pane is **macOS settings chrome and follows the platform**, not the
detail-column design language. Settings uses **semantic text styles** (`.body`/`.headline`/`.caption`
+ `.secondary`) and **semantic colors**, `Form.formStyle(.grouped)` with `Section` footers for
captions, and **native list/form rows** — not fixed-pixel type, not custom-RGB amber, not
`RoundedRectangle` floating cards. `design-language.md` remains **normative for the detail column and
read-only reference/reading panes** (its original scope); only the Settings carve-out is withdrawn.
The LL5 chat-panel exemption (2026-07-13) is unaffected — that is detail-column chrome.

Consequence: `LLMModelCardView`/`VoiceModelCardView`/`HFSearchResultRow` become plain grouped-Form
rows; the `Font.system(size:)` ramp and the amber RGB are deleted from `Sources/Outliner/Settings/`.
Full plan in `Docs/prds/in-progress/settings-ui-native.md` (decisions SUI-1..SUI-4). Presentation
only — no setting semantics, persistence, or plumbing change. Owner: Jan (north star), Fable (build).

## 2026-07-23 — NEW D27: opt-in, portable at-rest vault encryption (Jan) — full PRD written, next to build

Jan asked to design + fully spec at-rest local vault encryption; it fell out of the sync-key-model
thread (the collaborative keyring in `sync-and-multiplayer.md` §5.6.B is *this* mechanism with more
than one recipient — a locked local vault = VCK wrapped to a single recipient). Full PRD at
`Docs/prds/backlog/vault-encryption.md`; decision row **D27** added to `specs/decisions.md`. Owner: Jan.
**Slated as the next PRD to build after the in-flight UI streams settle.**

Shape: **opt-in per vault (default off)**, with an explicit warning that the vault stops being
plaintext-readable (external plaintext edits disabled) and that decrypt-in-place is always available.
**Portable, not proprietary:** content (`pages/**/*.md`, `assets/*`, `snapshots/*`) is **`age`-format**
ciphertext, decryptable with stock `age`/`rage` + the user's key (a **mandatory Export Recovery Key** =
an `age` identity file + a cleartext `DECRYPT.md` make this concrete). `.outliner/` DBs
(`index.sqlite` — which holds **full plaintext block text**, a real leak surface — plus `vectors.sqlite`,
`jobs.sqlite`) via **SQLCipher**; `vault.json`/`viewstate.json` via **AEAD**. One key (per-vault **VCK**),
three fit-for-purpose containers. VCK wrapped to **unlock sources** (passphrase→Argon2id and/or
Keychain/Secure-Enclave key) via an `UnlockProvider` seam — same seam sync will use for recovery-admin/
escrow (VE5, deferred to sync G4).

Invariants: **D20 preserved** (Markdown stays source-canonical, merely enciphered at rest — model layer
never sees ciphertext); **S7 scoped** (encrypted vault → "readable with `age`+your key, no app";
unencrypted default keeps S7 verbatim — mirrors D23's S7 carve-out). **Unification win:** encrypted-at-rest
bytes are already ciphertext, so syncing them (Git remote / relay) is **E2E for free** — same VCK.

Build plan **VE0→VE5**: VE0 spike (cross-tool `age` round-trip + Argon2/SQLCipher dep sign-off §8 +
notarization spike) → VE1 `VaultCrypto` core (headless) → VE2 content `age` per-file → VE3 DBs SQLCipher +
no-plaintext-leak scanner + S1 re-validate → VE4 UX (opt-in/convert/lock/unlock/recovery) → VE5 remote
unlock (deferred). Open sub-decisions (none block start): recovery model (mandatory key export + optional
iCloud Keychain rec.), `age` impl (CryptoKit-native vs Rust-age FFI), DB approach (SQLCipher rec.),
metadata leak (accept+document rec.), adopt-in-place (disallow on `pagesDir:"."` rec.), KDF (Argon2id rec.),
idle-lock default (15 min proposed), S1 budget.

## 2026-07-23 — Indent/outdent alt chord ⌘⇧←/→ → ⌘⌥←/→

Moved the **alternate** indent/outdent binding from `⌘⇧→` / `⌘⇧←` to `⌘⌥→` / `⌘⌥←`
(`CommandRegistry.swift` `indentAlt`/`outdentAlt` + the block-object Move ▸ submenu in
`ContextMenuModel.swift`). `⌘⇧←/→` is the Mac-standard "extend text selection to line edge"
chord (`moveToLeftEndOfLineAndModifySelection:` / `moveToRightEndOfLineAndModifySelection:`) and
is now reserved for that — freeing it restores standard selection extension automatically via the
editor's caret model (`OutlineView+Input.swift` → `CaretMotion`; nothing else intercepts the
chord). `⌘⌥→/←` was verified free. **`Tab` / `Shift+Tab` remain the PRIMARY, unchanged
indent/outdent bindings** (structural key map — not touched). This resolves the long-open
move-block-family binding note in `interactions/README.md` / `audit.md`. Guard:
`CommandRegistryTests.testOutlineCommandShortcuts`.

## 2026-07-23 — D26: add `quote` RowType + `- > ` marker (RC-D8)

New locked row D26 (`Docs/specs/decisions.md` §2). A blockquote becomes a first-class **row type**
(`RowType.quote`), serialised with the **bullet-prefixed** marker `- > text` and rendered with a
left accent bar + italic, secondary-ink text. Modeled end-to-end on how `.heading`/`.task` flow.
(The blockquote rendering that already existed lives ONLY in the Assistant chat panel; this is a
separate, independent vault-model construct — the chat renderer is not reused.)

**Marker = bullet-prefixed `- > `, NOT bare `> `.** Rationale: the leading `- ` keeps the
"every row is a list item" invariant intact (quotes nest, fold, and carry children like any other
row) and reuses the existing marker-escape machinery so the round-trip stays byte-stable. A bare
`> ` marker would break the list-item invariant AND open a brand-new escape surface (every quote
would need bespoke read/write handling). The user TYPES `> ` at block-start (the bullet is implicit
chrome, exactly as they type `# ` not `- # ` for a heading); the focused row re-reveals the bare
`> ` prefix dimmed, like a heading reveals `# `.

**Paste-ingest transform.** When Markdown is pasted from OUTSIDE the app (foreign clipboard text —
not our internal marker/`^ulid`-anchor-bearing clipboard format), bare `> ` blockquote lines
(respecting indentation) are normalised to `- > ` quote rows so they land as quotes. This generosity
is scoped to the paste/import path ONLY; the canonical FILE reader stays conservative — a bare `> `
in a vault file is never read as a quote.

**Contracts:**
- *Round-trip / identity (S4):* `- > text` round-trips byte-identically (non-empty, empty `- > ^id`,
  quote with inline marks, quote-with-children subtree).
- *No false reclassification (the load-bearing hazard):* a plain (non-quote) block whose text merely
  begins with `> ` is escaped on write (`- \> text`) and unescaped on read, so it stays a plain block
  with text `> text` — it can NEVER read back as a quote. This mirrors the existing
  `escapeMarkerLookalike`/`unescapeMarkerEscape` machinery, extended to the leading `> ` case, and
  shares that family's ONE known lossy corner: author text that *literally* begins with `\> ` loses
  the backslash on round-trip. That corner is a byte-fidelity edge only — classification stays safe
  (still a plain block, never a quote). Fixing the escape family is out of scope for D26; the
  common-case guarantee is byte-identical round-trip + no reclassification.
- *Exclusivity:* `RowType` is one-of — a row is exactly one of plain / heading / bullet / numbered /
  task / table / quote (setType conversions preserve text + swap only the marker).
- *One block per row (D1):* a quote is a SINGLE row; a multi-paragraph GFM `>` quote is expressed as
  sibling/child quote rows, not one multi-line block.
- *Nesting:* quotes nest and carry children like any other row (the bullet-prefix invariant).

## 2026-07-23 — RC-D4: `Command.duplicate` mints fresh ULIDs IN THE STORE (not caller-minted)

`Command.duplicate([BlockID])` deliberately mints its copies' ids inside `CommandStore` (via the injected `mint` seam), unlike `insertBlocks` which carries caller-minted fresh ids — because only the store can read the LIVE subtree to copy, and it already owns the injectable mint seam. So the command payload is ids-only; no `Block` payload crosses the boundary.

## 2026-07-23 — EXTENDS D25: relay stack (Rust, store-and-forward) + vault key model (Tier B envelope) (Jan)

Resolves the two things D25 left unspecified once Loro was picked (Loro ships **no** relay and
**no** key model — both are ours). Full spec in `Docs/prds/backlog/sync-and-multiplayer.md` §5.6; phased build plan + gates
(G0 Loro spike → G1 in-app async → G2 container relay → G3 RPi/LAN appliance → G4 managed SaaS)
in §5.7.
Owner: Jan. D23/D24/D25 architecture unchanged; this is a **v1-of-collaborative** concern that
secures both the async Git path and the real-time relay, and does **not** touch the local-only
`FileBackend` default.

- **Relay = Rust** (`tokio` + `axum`/`tungstenite`), a **content-blind rooms-and-blobs** websocket
  hub (fans out opaque ciphertext deltas; never decrypts, does **not** link Loro in v1). Chosen
  over Swift-on-Linux because the relay shares ~no code with the app and Rust's **static-musl
  cross-compile** is what serves a Raspberry Pi (`aarch64`) and cloud (`x86_64`) from one build.
- **Store-and-forward from day one** (Jan's call, overrides the stateless-v1 recommendation):
  buffers ciphertext deltas so an offline device catches up with **no peer online**. Embedded
  `redb`/`sled`, ack-driven GC, per-room TTL/size caps (numbers open).
- **Delivery:** one build → (a) static musl binaries as release assets (`scp` + `systemd`,
  `--data-dir`), (b) the same binary in a `FROM scratch`/distroless **multi-arch container** +
  persistent volume. Multi-instance sticky-routing/backplane **deferred**.
- **Key model = per-user identity keypairs + envelope-wrapped Vault Content Key** (Tier B):
  one symmetric VCK encrypts blobs; the vault carries a **keyring** of VCK wrapped to each
  member's pubkey; unwrap with your own private key. Add = wrap to pubkey; remove = rotate VCK
  epoch + re-wrap (seals future only — accepted ceiling). Keyring+membership is an **authenticated
  sub-doc** (owner/admin/member roles). Relay auth becomes a **signature challenge**, not a shared
  bearer secret. Same model secures the Git-backed async path. **MLS (RFC 9420) deferred** behind
  a "group keying" seam.
- **Open sub-decisions (none block starting):** **key recovery/loss** (iCloud Keychain sync vs
  recovery phrase vs recovery admin — the biggest UX fork), relay TTL/size-cap numbers, trust
  bootstrapping (TOFU + fingerprint; optional managed directory), multi-instance backplane.

## 2026-07-23 — NOTE (AI-generated indicator): `ai::` extended from batch-only to ALL AI paths + always-on gutter chip

Per user request (2026-07-23), the `ai::` block-property convention (2026-07-21 NOTE, format.md §2) is
**generalized from batch-only** to mark blocks from **every** AI path. The value is now
`ai:: <source> <ISO-8601-UTC>` where `<source>` is the batch **jobID** (a ULID, unchanged) OR a literal
`synthesis` (Synthesis *convert-to-page*) / `assistant` (Assistant chat *save-to-page*). ONE build/parse
convention now lives in `AIProvenance` (OutlineModel): `value(source:date:)` builds, `parse(_:)` →
`(sourceLabel, date)` (ULID → `Batch`, `synthesis` → `Synthesis`, `assistant` → `Assistant`);
`AIProvenanceWriter.provenanceValue` was refactored to route through the shared builder (one convention,
no drift), and `saveSynthesis` / `saveChat` tag the WHOLE inserted forest (roots + all descendants) via
`AIProvenance.tagged`. This is **NOT** a grammar/format change — still a documented convention over the
locked `key:: value` syntax (Q1). Revert-safety is preserved: `AIProvenanceWriter.revertJob` only ever
iterates `JobStore` items, so `synthesis`/`assistant` values (never in a `JobStore`) are never
encountered. The property is **burned-in** across ordinary user text edits (properties are independent
of text via the command API); only job-revert / block deletion removes it. The editor renders every
`ai::` block with a subtle, always-on `sparkles` gutter chip in the SAME left band the `t::` recording
chip uses (band auto-reserves on any page with ≥1 `ai::` block; `t::` wins the band on co-occurrence).

## 2026-07-22 — Crash-Safe Recording SP3 retired by measurement; C1 re-scoped (no periodic fsync)

The design (§6 / C1) called for a T=5s flush/`fsync` to bound crash loss. We are **NOT** implementing
it. `AVAudioFile` exposes no file descriptor, so a real `fsync` would require replacing the shipped
`CallWriter`/`RecordingWriter` with a hand-opened-fd `ExtAudioFile`/`AudioFile` stack — a full rewrite
of test-locked code that would also have to re-derive the int16 down-conversion `AVAudioFile` does for
free and re-validate the CAF `mChunkSize = -1` streamability the whole recovery design depends on.
More importantly, the only safe place to run `fsync` is the serial processing/drain queue, and `fsync`
is an unbounded blocking syscall: a stall there stops the queue draining the bounded SPSC ring, which
drops-and-counts on overflow — i.e. a periodic `fsync` trades a rare sub-100 ms crash-tail loss for a
recurring risk of real mid-call **dropouts**, the exact failure the RT→ring→drain design exists to
prevent. SP1 already measured the unflushed tail at sub-100 ms because the master and 16k tracks are
linear PCM written straight through (no AAC trailer, no large encode buffer), and the CAF reads to EOF
with no header patching. The practical crash-loss window is therefore that sub-100 ms plus normal OS
page-cache latency — well under the 5 s target — with no explicit flush. C1's substantive guarantee
("audio lost never the whole call, within target") holds **by construction** from LPCM
straight-through capture, not from a flush barrier. Accordingly: **SP3 is retired by measurement**
(the belt-and-braces flush is dropped), and **C1's wording is re-scoped** from "audio lost ≤ the flush
interval" to "audio lost ≤ the measured straight-through bound (sub-100 ms of in-flight buffers plus OS
page-cache latency, well under the 5 s target)." Revisit only if a future writer change (moving the
master off LPCM, or SP2 forcing approach B / fragmented MP4) reintroduces buffered encoding, in which
case explicit durability must be re-evaluated against this same drain-stall constraint.

## 2026-07-22 — Crash-Safe Recording Q5: orphan cleanup is SILENT reap/age-out (not prompt-then-reap)

The PRD header tentatively resolved Q5 as "prompt-then-reap orphans"; the shipped behavior is **silent**
reap/age-out and we are keeping it. A finalized/missing-page orphan (reap) or a null-page / perpetually
un-probable sidecar past its horizon (age-out: 7 d null-page, 30 d backstop — CR-D7 / C3) has no
recoverable home, so a prompt would only nag. Reap/age-out run off-main, best-effort, at the launch
scan. The consent-forward, EXPLICIT "Recover recording" action (Q4) is unchanged — only orphan
*cleanup* is silent. Revisit if users report surprise disappearance of recoverable data.

## 2026-07-22 — Crash-Safe Recording: sidecar joins page by `page_id` only (`page_path` reserved)

The recovery sidecar joins to its armed page by `page_id` (ULID) **only**; the `page_path` schema field
is reserved but left `nil`. A ULID survives moves/renames, so `page_id` is strictly more robust than a
path. Accepted gap: if the vault index is lost and a `page_id` cannot resolve, there is no `page_path`
fallback (the sidecar then ages out via the 30-day backstop rather than mis-joining). Thread
`page_path` later only if index-loss recovery becomes a real need.

## 2026-07-22 — Crash-Safe Recording CR-D7 close-out audit: five correctness fixes

A close-out audit of the shipped CR-D1…D6 (3 Opus review agents against success criteria C1–C6 and
spikes SP2–SP5) found and fixed five issues on branch `crash-safe-closeout` (commits `CR-D7 (B1…C4)`):
**B1** — the recovery sidecar was written *after* the recorder began capturing, so a crash in that
window orphaned capture files with no manifest (unrecoverable + never reaped, a leak); now written via
a non-throwing `onSessionArmed` seam inside `start()` before `backend.start`, plus a manifest-less
orphan sweep. **B2** — the "Recover recording" banner was `@ObservationIgnored` so the async launch
scan didn't invalidate it; made observed. **B3** — the recorder panel's scratch sweep blanket-deleted
every `memo-*` in the shared recovery dir, destroying *other* sessions' recoverable memos; scoped to
its own session stem. **C3** — a valid-`page_id` sidecar whose probe throws forever was retained
forever; added a 30-day age-out backstop. **C4** — if a page was demoted between the scan and the
"Recover" click, the Vault fallback minted a duplicate page; added an upstream re-probe guard that
throws `nothingToRecover` (retaining files for a clean re-scan). All five ship with tests; the full
SPM suite is green (2326 tests). The two app-target tests (`CallRecoveryIdempotencyTests`, B2
observation) run under xcodebuild only. **Open for Jan:** live-mic crash spot-check (`kill -9` mid-call
→ relaunch → Recover) and merging `crash-safe-closeout` → `main` (then `git mv` the PRD to `shipped/`).

## 2026-07-21 — NOTE (batch-processing B4): `ai::` block property is the batch-provenance convention

The `ai::` writeback (`AIProvenanceWriter`, B4) uses the LOCKED `key:: value` block-property syntax
(Q1) **verbatim** — no new grammar, no reader change, no writer change, no round-trip change. An
`ai::` block property is the same class of app-written, **non-reserved** convention as `t::` /
`audio` / `call_state`: `id`/`title` remain the ONLY reserved keys. The value is the space-joined
`<jobID-ULID> <ISO-8601-UTC>` (e.g. `01J9Z8Q3K7 2026-07-21T09:14:03Z`) — it contains no `::`, is
byte-stable as a property line, and is S4-pinned by a byte-for-byte round-trip test. `ai::` is **NOT
reader-interpreted** in B4 (it is a documented convention only); making it reader-interpreted or
promoting it to a reserved key later requires Jan sign-off.

Bulk-undo (revert-a-whole-job) is added via a new terminal `BatchJobStatus.reverted` (reachable only
from `done`, guarded by `JobStore.markJobReverted`) plus `AIProvenanceWriter.revertJob`, which deletes
the recorded `ai::` block ids through the command API (`deleteBlocks`). A block a user has since
hand-deleted or hand-edited is a safe no-op: `deleteBlocks` filters unknown ids, so revert never fails
on a missing block and never touches non-`ai::` content (it only ever names ids from the item's
`result_ref`).

## 2026-07-21 — NOTE (crash-safe-recording CR-D5b-1): `call_state` generalized to memos; `kind: memo` dropped at finalize

The memo pre-arming happy path (`Vault.createArmedMemoPage` / `finalizeArmedMemoPage`) mirrors the
shipped Live Call Notes flow so a voice memo pre-arms a notes page at record-start (Jan signed off on
the page appearing at record-start). Two format decisions, both to preserve S4:

- **`call_state: recording` is REUSED, not re-minted.** The crash-durable "this page is armed and
  capturing" marker now applies to an armed page of **either** `kind: call` OR `kind: memo`. No new
  frontmatter key — the existing `call_state`/`CallMemoSupport.callStateKey` carries both. The
  predicate `isArmedRecordingFrontmatter` = `(kind ∈ {call, memo}) && call_state == recording` is the
  single generalized guard behind the shared demote (`clearArmedRecordingState`, with a
  `clearArmedCallState` alias kept for call callers).
- **A finalized memo DROPS BOTH `call_state` AND `kind: memo`.** This is the one non-literal mirror of
  the call finalize (which KEEPS `kind: call`): a plain voice memo carries no `kind`, so a finalized
  pre-armed/recovered memo must shed `kind: memo` to be **byte-identical to a `createMemo` page** —
  the load-bearing S4 non-regression (pinned by a byte-for-byte test modulo ids). The demote path
  applies the same rule (a memo sheds both markers; a call sheds only `call_state`).

CR-D5b-1 is the UX-visible happy path only; it does NOT touch the recovery scanner/coordinator
(deferred to B5b-2). Live-Call-Notes-style `t::` note-stamping WAS included (the Vault stamp path is
generic on page id — cheap to reuse via the flow's `updateNoteStamp`/`clearNoteStamp`).

## 2026-07-20 — NOTE (editor-tables): live type-to-create fold drops absorbed body-row ids

The live type-to-create table fold (`Command.foldTable`, minted inside `Vault.apply` the instant a
run of consecutive sibling pipe-row blocks forms a valid GFM table) is the model-layer twin of the
disk migration fold and the B12 paste fold — and it inherits the SAME accepted tradeoff: the header
block keeps its id, but the ABSORBED body-row blocks LOSE their block identity (they are removed; the
table body is re-derived from the header block's now-multi-line source). A same-session `((ref))`
pointing at a just-typed body row that then folds would dangle — this is the near-zero edge accepted
for v1 (parity with the migration, DECISIONS 2026-07-19). The fold is its OWN single undo step (Model
A: ⌘Z un-folds back to the separate bullets with identical ids/orders; ⌘Z again undoes the keystroke),
so the id loss is fully reversible until the page is written. All three call sites (disk migration,
paste bridge, live detector) share ONE strict fold guard (`GFMTableParser.isStrictTableRun`).

## 2026-07-20 — Editor-tables Phase B: in-grid per-cell editing LOCKED (Jan)

Locks the editing model for `RowType.table` (Phase A model already shipped). **D1 confirmed**
(table = one multi-line block). **D3 REVERSED**: not raw-source-only editing — **in-grid per-cell
editing** is v1 (caret-in-cell = ordinary scalar offset into canonical source; Tab/⇧Tab cell nav;
grid re-lays out live on edit). **D4 = Option B** (per-cell CoreText grid, not a single attachment,
not NSTextTable). **D5 locked** (^id on header + continuation). Reveal-to-raw survives as the
**fallback** for malformed/half-typed tables (no valid delimiter) — the block renders/edits as raw
multi-line source until a valid delimiter makes `GFMTableLayout.spans()` succeed, then it grids.
Justification vs D20: in-grid honors "source-canonical + every edit mutates source" fully and only
substitutes a structure-appropriate reveal for the one 2-D block type (a 1-D reveal-to-raw discards
the table's second dimension — the Logseq weakness we reject).

**Phase-B interaction rulings (per Obsidian/GFM, tunable on-device):** (1) a NEW offset-faithful
`GFMTableLayout`/`CellSpan` tokenizer provides byte-exact per-cell source ranges — Phase-A
`GFMTableParser` trims/unescapes so it is offset-destroying and stays as derived-convenience only;
(2) in-cell newline = `<br>` (only GFM-legal break; literal `\n` never enters a grid-mode cell; typed
`|` auto-escapes to `\|`); (3) Tab = next cell (content selected), Tab-at-last-cell appends a row;
(4) Enter = cell-below, Enter-at-last-row exits downward to a sibling; (5) cross-cell text selection
is v1-out (clamps to one cell; block-select copies whole-table GFM). Build phasing B0–B11 with a
throwaway `TableSpike` gate (grid measure/draw/height + hit-test + live source-mutation) before the
real layout lands. Full Phase-B design captured in the coordinator's design pass.

## 2026-07-19 — NOTE (D1/D5, editor-tables Phase A): two `.table` classification variants

Records a deliberate asymmetry between how the reader classifies a `.table` block on the
**canonical** path vs. the one-time **migration** fold, so a future reader neither "fixes" the
canonical path to match nor loosens the migration guard.

- **Canonical classification follows GFM** — a block folds to `.table` when its first line
  contains an unescaped `|` **and** its next line is a valid delimiter row (pipes-optional header
  + valid delimiter). This is the standard GFM rule; a header may legitimately have a single cell
  or omit outer borders. The delimiter+body arrive as the header block's continuation lines, so
  this path changes **zero bytes** (not a normalisation).
- **Migration fold is stricter** — the legacy sibling-row shape (`- | a | b |` / `- |---|---|` /
  `- | 1 | 2 |` as separate bullets) is a byte-changing **rewrite** (`wasNormalized`), so it must
  not silently reclassify legacy prose that merely contains a pipe (e.g.
  `- a | b for the OR operator` above a delimiter-shaped row). The migration path therefore folds
  ONLY when the header splits into **≥2 unescaped-pipe cells** AND that count **equals the
  delimiter's column count**. Below that bar the run stays ordinary bullets. (Reviewer
  non-blocking #2, applied in `MarkdownReader.foldTableBlock`.)

No locked decision changes; this is a clarification of the D1/D5 reader contract.
## 2026-07-19 — Editor-tables D1 CONFIRMED: table = one multi-line block (Jan)

Jan confirmed **D1** — a GFM table is the editor's **first multi-line block** (`RowType.table`,
verbatim multi-line `SourceText` canonical), not a run of row-blocks. This unblocks the
editor-tables build. Basis: both Obsidian (CM6 Live Preview) and Logseq model a table as one
contiguous GFM source construct, and the locked D4=B (per-cell CoreText selection grid) is
structurally incompatible with row-blocks. Introduces the format's first multi-line-block rule
in `format.md` (§5.1/D5) — the same continuation mechanism will later serve fenced code blocks.
Jan additionally asked that the caret-interaction model be grounded in how Obsidian/Logseq
handle in-table caret behavior before finalizing the editing UX. Build sequence: Option-B spike
(gate) → model+GFMTable+reader/writer → grid layout+per-cell select+hit-test → chat re-point.

## 2026-07-19 — Editor-tables: D4/D5 locked, D1 recommended (pending confirm) (Jan)

On `Docs/prds/shipped/editor-tables.md` §11. **D4 = Option B (per-cell CoreText selection grid)** — LOCKED:
Jan chose Obsidian-grade per-cell editing over the cheaper custom-`NSTextAttachment` Option A
(whole-table selection). This supersedes D3 (raw-source-only) and moves the PRD's effort from L
toward L/XL (substantial new hot-path CoreText layout). **D5 = `^id` on the table's header line +
delimiter/body as block continuation** — LOCKED (fenced-sentinel alternative rejected: non-GFM
noise, breaks portability). **D1 (table = ONE multi-line block) — RECOMMENDED, pending Jan's
confirm.** Jan asked for the comparative analysis first; result: both Obsidian (CM6 Live Preview)
and Logseq model a table as one contiguous GFM source construct, not as row-blocks — and D4=B (a
per-cell grid needs the table to be one layout unit) is structurally incompatible with the row-block
alternative, so D4=B forces D1=Yes. Build is held until Jan confirms D1; the §5.3 spike (re-scoped
to Option B) and full design proceed meanwhile so it's shovel-ready. Same multi-line-block mechanism
later serves fenced code blocks.

## 2026-07-19 — Live-call-notes Q1–Q5 resolved; Discard now preserves notes (Jan)

Jan accepted all five recommended answers in `Docs/prds/shipped/live-call-notes.md` §10 (build
already shipped on them). The only one that changes shipped behavior: **Q4 — Discard-audio
now downgrades a call to a plain notes page instead of destroying everything.** This
intentionally reverses the shipped call-recording "Discard ⇒ nothing kept" semantics, now
that a call page can hold authored live notes — notes are never destroyed; only the
audio/transcript is discardable. Q1 (Transcript-above-Notes), Q2 (stamp at block birth),
Q3 (gutter always on for call pages), Q5 (arm eagerly, auto-downgrade zero-note calls) are
low-stakes defaults. Remaining work on the PRD: the deferred per-line `t::` gutter chips
(§6.2), an app-running verification task.

## 2026-07-19 — AMENDS D23: CRDT library = Loro (was provisionally Automerge) (Jan)

Resolves the open "which CRDT library" question flagged when D23 was locked. After a cited
3-way evaluation (Automerge vs Yjs vs Loro) through the lens of a native Swift outliner,
**D23's Collaborative backend is now Loro (loro.dev); Automerge is the documented fallback
behind the same `VaultBackend` seam.** Owner: Jan. The per-vault-backend architecture (D23)
and the hosting model (D25) are unchanged — only the library name. The collaborative backend
type is renamed `AutomergeBackend` → **`CRDTBackend`** (Loro impl) to keep the swap cheap.

**Decisive reason — movable tree.** An outliner is a tree of blocks that get indented/
outdented/reparented concurrently. **Loro is the only one of the three with a first-class
movable-tree CRDT** (cycle-forbidden, no duplication; per Kleppmann's move-op paper). In
Automerge and Yjs a concurrent move degrades to delete+insert and **duplicates the subtree** —
the core correctness hazard for exactly our data structure.

**Two reinforcing reasons, both aligned with decisions we just locked:**
- **E2E (D25).** D25's commercial relay must be end-to-end encrypted. Automerge's own team
  calls per-change E2E "prohibitively expensive"; **Loro syncs by shipping opaque binary
  deltas over our own transport, so E2E is the natural default.** The CRDT choice and the
  hosting decision reinforce each other.
- **S1 cold-open.** Loro is the fastest to load with the lowest memory in the benchmarks;
  Automerge's historical weak spot is cold-loading a large doc — directly relevant to the
  10k-block ≤1.5s budget.

Also: `loro-swift` (official UniFFI XCFramework, v1.13.2 2026-06) is usable from Swift 6
today; Peritext+Fugue rich text maps onto our `InlineText` marks; tree→Markdown projection is
the most 1:1 of the three; MIT-licensed. **Yjs is eliminated** — no production native-Swift
binding without a JS runtime (`yswift` dormant since 2024).

- *Top risk (accepted, mitigated):* `loro-swift` is self-labeled "experimental," the team is
  smaller than Ink & Switch (higher bus factor), and **Loro ships no relay — we build the
  sync transport** (Automerge would hand us one). Mitigations: the `VaultBackend` seam keeps
  Automerge a drop-in fallback; owning the transport is what makes D25's E2E easy; D25 already
  commits us to running a relay regardless.
- *Two pre-build gates (not blockers to the decision):* confirm `loro-swift` surfaces the
  movable-tree + checkout/diff APIs (not just the Rust/JS core), and re-run `crdt-benchmarks`
  against shipped 1.x versions (the public snapshot tested an old Loro where doc-size
  regressed). Full cited comparison in `Docs/prds/backlog/sync-and-multiplayer.md` Appendix I.

## 2026-07-19 — ADOPTS D25: collaboration hosting — self-host + commercial relay (Jan)

New locked row D25 (`Docs/specs/decisions.md` §2). Resolves the open question in
`sync-and-multiplayer.md` §7 (Q-C, "who runs the real-time relay"). Owner: Jan. Directional
lock, post-v1, unbuilt.

Real-time collaboration (the CRDT relay of D23) ships with **two deployment options**:
**(1) self-hosted / on-premise** — the user or org runs the relay on their own infra, we
operate nothing, full data sovereignty; **(2) a Enliner commercial managed relay** — a
paid, turnkey hosted sync service we operate, **end-to-end encrypted so we cannot read vault
contents**. Async sync stays serverless for everyone and needs neither.

- *Rationale:* on-prem serves privacy-sensitive/enterprise users and keeps the no-server
  ethos intact; the commercial relay gives non-technical users turnkey team play.
- *Open, does not block D25:* **which CRDT library** backs D23's Collaborative backend
  (Automerge vs Yjs vs Loro) is under evaluation as of 2026-07-19 (native-Swift binding
  maturity, movable block-tree support, marks, perf, self-host + commercial sync, Markdown
  projection). The chosen library determines the concrete relay (`automerge-repo-sync-server`
  vs `y-sweet` vs Loro's). D25's two-options structure holds regardless of the pick.

## 2026-07-19 — ADOPTS D23 + D24: per-vault sync backend + multi-vault rail (Jan)

Two new locked rows added to `Docs/specs/decisions.md` (§2 table). Both are **directional
architecture locks for post-v1 work** — no code exists, and "sync service" remains a v1
non-goal (`Docs/specs/overview.md`). They lock *direction*, not schedule. Owner: Jan.

**D23 — Sync/versioning is a per-vault backend choice.** Resolves the study in
`Docs/prds/backlog/sync-and-multiplayer.md`. A vault is **Local** (Markdown-canonical — D0/D10/D20
intact — with Git for optional versioning + async sync, block-ID auto-merge, D9 conflict-file
fallback) or **Collaborative** (**Automerge** CRDT-canonical, `.md` continuously projected,
full auto-merge). Async is serverless; real-time needs one self-hosted
`automerge-repo-sync-server` relay. One `VaultBackend` seam; `FileBackend` first,
`AutomergeBackend` opt-in second; default Local. The key property that made this lockable:
**the D20-reversal and S7-weakening are scoped to opted-in Collaborative vaults only** — the
default experience keeps Markdown canonical, so this does *not* reverse D20 globally.

- *Rejected alternatives (kept for the record):* app-wide Git-only (no real-time, no
  auto-merge ceiling); app-wide Automerge-as-source (reverses D20 for everyone, weakens S7,
  needs a server for real-time). The per-vault synthesis dominates both.
- *Migration impact:* adds a per-vault `syncMode` (`local`|`collaborative`) to `vault.json`;
  Collaborative vaults add a projected-Markdown + CRDT-binary persistence alongside the index.
  Local vaults are byte-identical to today. libgit2 / automerge-swift would be the **first
  native deps** — each needs a licence + App-Sandbox/notarization sign-off (CLAUDE.md §8)
  before adoption in code.

**D24 — Multi-vault workspaces via a left rail.** Per `Docs/prds/in-progress/multi-vault-rail.md`.
Slack-style vertical vault-icon rail; multiple vaults added/removed/reordered; one active
vault per window (D17). Builds on the already-shipped `VaultRegistry`
(`Sources/OutlinerCore/VaultRegistry.swift`), extended with per-vault identity/`kind`/order;
promotes the single `VaultController` to a `VaultCoordinator` with a warm LRU pool. **Owns**
the create-time Local/Shared choice, a new Settings › Vault tab, and reversible mode migration
(mechanics per D23). Remove = unregister, never deletes files. Ships value on **local-only**
vaults independent of D23; only real migration depends on D23's Collaborative backend.

- *Migration impact:* extends the persisted `VaultRecord` with optional `displayName` / `icon`
  / `kind` / `order` (defaulted, so existing registries decode unchanged). No on-disk vault
  format change for Local vaults.

## 2026-07-19 — D18 partially reversed: ⌘K = Add Link; Command Palette → ⌘P (Jan)

D18 partially reversed: ⌘K no longer arbitrates to the Command Palette. ⌘K = Add Link (wrap
selection); Command Palette moves to ⌘P. Reason: ⌘K→link is the universal Mac convention; the
arbitration was non-obvious. Owner: Jan. See Docs/specs/interactions/audit.md §7.

## 2026-07-18 — REVERSES D20: markdown source becomes canonical; cursor-driven reveal (Jan)

**Reverses [D20] ("Parse-as-you-type with delimiter consumption (Bike-style); delimiters never
enter the display string").** Jan's call, made after the ribbon-caret / link-collapse bug streak
(2026-07-17…18) exposed the root cause: the marks-canonical `InlineText` model **hides delimiters
in the model**, so every edit-then-leave has to *transform* the data (raw literal ↔ consumed mark)
via a hand-maintained set of exit-event sweeps (`LinkSweep` at blur/Enter/click/arrow, plus
`MarkUnconsume`/`PairReconsume`). That transform is an open-ended edge-case matrix and a
round-trip-fidelity risk (see the two design reviews under this entry's design doc). D20's own
rationale — *"Forced by the `InlineText` model (no markup in the string — there is no syntax to
reveal)"* — is exactly the shoehorn we're removing: we were fitting a rich-text (marks-canonical)
model under markdown syntax. **Rich text is rich text; if we wanted rich text we would not have
used markdown syntax.** Markdown-as-canonical is the industry direction (Logseq / Obsidian Live
Preview / Typora / CodeMirror-6) and is less buggy because rendering becomes a pure function of
`(source, caret)` with no second representation to keep in sync.

**The new model (locks, replacing D20):**

1. **Markdown source is canonical for inline content.** A block's inline text is the markdown
   *string* (`**bold**`, `[label](url)`, `#tag`, `[[Page]]`, `((ulid))`, `![alt](path)`);
   styling is a **render decoration derived from the source**, never a pre-compiled stored model.
   Editing is plain-string editing on the source. `Mark`-mutating commands (`.setMark`, the
   consume/unconsume paths) collapse into text edits (bold-a-selection = wrap in `**`).
2. **Cursor-driven reveal (classic Logseq).** The **focused** block renders **raw source**
   (delimiters visible, `display == source == model`, identity — the caret only ever lives here,
   in plain-text space). An **unfocused** block renders **compiled** (delimiters hidden/dimmed,
   spans styled). The caret **jumps to the raw-source position** on focus-in (Jan, 2026-07-18).
3. **Reconcile-on-leave is a pure RE-RENDER, not a model rewrite.** Leaving a block re-renders it
   compiled off the unchanged canonical source; entering re-renders it raw. There is no data
   transform on focus change, so no exit path can corrupt the model and no sweep is needed.
4. **Images** follow the general reveal rule (Option 1, Jan): caret in the block → raw
   `![alt](path)`; caret out → inline thumbnail embed.

**Refinements (Jan, 2026-07-18 follow-up — "no half-assing, architectural purity"):**

- **R-Q1 — FULL source, not inline-only.** Block-type syntax (`## `, `- [ ] `, `1. `) also lives
  in the block's source string; `RowType` becomes a **derived** render property (parse the leading
  marker), NOT a stored structural field. `RevealPrefix` and the block-type `RowTypeTrigger` are
  therefore **deleted** — a focused row is 100% raw-source identity with no synthesized prefix.
  **The one hard boundary (physics, not a shortcut):** the outline TREE — nesting/indent/bullet/
  fold — stays structural, because it spans blocks and cannot live in a per-block string (this is
  exactly Logseq's boundary: a block's *content* is markdown; the *nesting* is the outliner).
- **R-Q1 — atoms are pure too.** A focused block shows RAW source for **every** construct including
  `((ulid))` (→ `((01J…))` literal) and `![alt](path)`. This removes the last chip/atomic exception
  on the focused row, so it is *genuinely* identity (supersedes the earlier "blockref = chip even
  when focused"). Unfocused, atoms still substitute (blockref → preview chip, image → thumbnail
  embed) because their reading form is not a dimmed delimiter but a wholly different glyph.
- **R-Q3 — delimiters are DIMMED, not hidden, and it is a SETTING** ("Markdown syntax when not
  editing: Dimmed | Hidden", default **Dimmed**; Jan: "everything's markdown these days, people are
  used to reading it"). **Architectural payoff:** in Dimmed mode the unfocused display string ==
  the source string (delimiters stay, just faint) for emphasis/link syntax, so `display == source`
  in BOTH focus states → the compiled↔source offset map and the `.nearest`-rounding hit-test (the
  last real risk) **do not exist**, and rows do not reflow on focus. The *Hidden* setting is the
  classic reveal (delimiters removed when idle) and re-introduces that one-shot map — shipped behind
  the setting, not on the default path. Atoms (image/blockref) substitute regardless of the setting
  (an unreadable ULID/path is never shown, dimmed or not).
- **R-Q4 — caret after the inserted syntax.** An autocomplete accept inserts the full source form
  (`[[Page]]`, `#tag`, `((ulid))`) and lands the caret AFTER it, consistent with any text insertion
  (architectural purity over a bespoke "land inside for alias typing" affordance).

**Blast radius & why it is broad-but-shallow, not deep.** The editor side *shrinks*: `LinkSweep`
+ the exit-matrix, `MarkUnconsume`, `PairReconsume`, the delimiter-consumption smart triggers, and
the inline `DisplaySubstitutionMap` offset-straddle are **deleted**; the focused row is identity so
the delicate raw↔model caret map (the #1 risk both reviews flagged) never exists. The broad piece
is the model-type change (`InlineText` → canonical source string) rippling through commands, the
`Diff`, the SQLite index derivation (backlinks/tags/links parsed from source — already how
load-from-disk works), copy-paste, and AX — but that is mechanical, compiler-guided, and gated by a
**byte-exact `.md` parity oracle** (on-disk files are *already* markdown source, so the format does
not change and every migration step is diffable against the vault).

**Process:** full design + migration doc + adversarial review land alongside this entry before any
code; implementation is staged **model-layer first**, each stage green against the `.md` parity
oracle before the next. This reverses a locked decision, so it is logged here and folds back into
`Docs/specs/decisions.md` (D20 row) + `editor.md` + `model-types.md` on completion.

Signed off: **Jan, 2026-07-18.**

## 2026-07-17 — Live Call Notes: new `call_state` memo frontmatter key + `t::` from the recording clock (Jan)

New feature (`Docs/prds/shipped/live-call-notes.md`): the call page is created **at record-start**
("armed") so the user can take notes during the call, and each note line is stamped with the
recording-relative time it was created. Two small format touches, both landing in
`Docs/specs/format.md` (§ Memo pages) under this entry:

- **New optional memo frontmatter key `call_state`.** Value `recording` while a call page is
  armed and capturing; **absent** on a finalized page. It is an ordinary app-written,
  NON-reserved flat frontmatter key (round-trips verbatim, exactly like `audio`/`recorded_at`/
  `duration_s`/`source_app`/`speaker_*`). It exists because the memo discriminator is a non-empty
  `audio:` value (`Vault.memoInfo`), and an armed page has no audio yet — so without an explicit
  marker its blocks would fall through `splitTranscriptNotes`'s "no `notes_after` ⇒ all-transcript
  (read-only)" branch, the opposite of the intended "all blocks are editable Notes." `call_state:
  recording` is the crash-durable signal that a page is an armed call page (banner + all-Notes
  rendering + live stamping). It is removed at finalize, after which the page is byte-identical in
  shape to a `createCallMemo` page with M7 notes.
- **`t::` may originate from the recording clock**, not only a transcript segment. format.md
  already documents `t:: MM:SS` on transcript blocks; this notes that call-notes blocks carry the
  same property stamped at block-creation time (`MemoSupport.formatTimestamp(elapsed)`). No new
  grammar. Display of the call-notes gutter is independent of the global "timestamps in
  transcripts" setting (that setting governs the Transcript region only) — Q3 in the PRD.

No new reserved keys; `id`/`title` remain the only reserved keys. No writer change (flat
unknown-key round-trip carries `call_state`). The merge that pairs the post-call transcript onto
the armed page reuses the existing M7 `notes_after` boundary + `replaceMemoTranscript` machinery.

Open questions (PRD §10) still to confirm with Jan: merge layout order (Q1), when a line counts as
"created" (Q2), gutter-always-on (Q3), whether Discard-audio keeps the notes page (Q4 — proposed
YES, reversing the shipped "Discard ⇒ nothing kept" now that notes can exist), and eager-vs-lazy
arm (Q5).

*A pricing and licensing decision entry has been omitted from this public copy of the log.*

## 2026-07-15 — "Load on start" + idle-unload owns ALL unloading (redesign, supersedes keep-loaded) (Jan)

**Supersedes the same-day "Keep-loaded mode" entry below.** Jan-directed redesign: the compound
"Keep loaded in memory" mode is replaced by **two orthogonal axes**, each independently meaningful:

1. **Load on start** (rename of `keepLoadedInMemory` → `loadOnStart`; both engines — Assistant MLX
   model and Voice WhisperKit model): governs only **when the model LOADS** — in the background at app
   launch (all prior gates carry over: identity-checked, downloaded-only, Apple-Silicon,
   failure-tolerant, never an implicit download; the closed-panel model-switch re-preload and the B1
   identity-checked panel adopt are unchanged) vs on demand.
2. **Idle unload** (the segmented Never/5/15/30/60 picker) is now the **SOLE unload policy**.
   **PRD §3/C1 amendment: ⌥⌘A off no longer frees RAM instantly** — closing the panel just lets the
   idle countdown run; RAM returns when the interval elapses (or never, under Never). "Never" (0) =
   resident once loaded, however it got loaded. The "picker disabled while keep-loaded is on"
   interaction is gone — both controls are always enabled.

Mechanics: the idle countdown moved from the per-window panel presenter into `VaultController` (the
shared app-level owner) so it **survives panel close**; panels feed activity ticks (send/stream token,
load completion, panel close = last activity), the launch preload ticks it too, and a fire defers
under a live stream. The pure decision matrix is
`LLMLifecyclePolicy.action(for:loadOnStart:idleUnloadMinutes:)` (headless-tested).

Migration (one-way, tolerant): legacy `keepLoadedInMemory=true` (llm-preferences.json) →
`loadOnStart=true` **and** `idleUnloadMinutes=0` (the old mode implied both axes); legacy false →
`loadOnStart=false`, idle untouched; a present `loadOnStart` key always wins; the legacy key is never
written back. Voice side: `voice.keepLoadedInMemory` → `voice.loadOnStart` (same one-way read-through;
no idle axis to split — WhisperKit has no idle-unload, so Load on start only moves the load earlier).

## 2026-07-15 — Index the memo status: `pages.audio` column (migration v4)

**Schema addition** (`Docs/specs/database.md`, migration v4): a nullable `audio TEXT` column on the
`pages` table. It holds the vault-relative recording path from a memo's `audio:` frontmatter key
(format.md §2 "Memo pages"), NULL for a non-memo. It is the **sole memo discriminator** (matching
`memoInfo`): a page is a voice memo iff `audio IS NOT NULL AND audio <> ''`.

**Why (measured cost).** `Vault.memoPageIDs()` — the sidebar's memo/plain glyph signal — used to
decide memo status by opening and frontmatter-parsing EVERY page file on disk. On the real vault "T"
(521 pages) that scan cost **~1094 ms** (measured, `TagOpenPerfTests`), and it ran on every
`refreshPages()` (open, rename, delete, create, external reconcile). A prior fix (d8cd3da/edf637a)
moved it off the interactivity path into a token-guarded background hop, but the scan itself
remained. Indexing the status turns `memoPageIDs()` into a single indexed
`SELECT id FROM pages WHERE audio ...` — **~0.1 ms** on the same fixture (~10 000× faster; harness
memo phase collapsed from 1094 ms to 0.1 ms). Because the query is now free, it was **folded back
into the synchronous `refreshPages()`** (the token dance / `refreshMemoGlyphsInBackground` are gone),
so the glyph is correct on the first paint. The 69 ms tags-interactive number is not regressed
(measured 77 ms, memo now included at 0.1 ms cost).

**Migration + heal mechanism.** Migration v4 only `ALTER TABLE pages ADD COLUMN audio TEXT` — it
does NOT backfill, because the value lives in each file's frontmatter and is not derivable from
existing DB rows. Population of pre-existing indexes rides the established **D23 content-version
heal**: `Vault.indexContentVersion` is bumped `1 → 2`, so on the next cold open the stored version
trails the code's and `coldOpenScan(forceParse: true)` force-reparses every page, writing `audio`
through the indexer's `upsertPageMeta(audio:)`. The indexer writes the column on every
index/reindex/edit-reindex from the parsed frontmatter; byte-unchanged metadata touches (rename,
mtime-only touch) **preserve** the column rather than reparse. No new heal surface was added — the
column population is additive inside the existing parse loop (a parallel cold-open-progress task owns
the loop's reporting; no collision).

**Consumers.** `memoPageIDs()` → indexed query (API unchanged). `memoInfo(page:)` is LEFT on the
live frontmatter read (it needs the full memo metadata — recorded_at, duration_s, notes_after,
speakers — not just the discriminator, and is called per-open, not per-refresh). The former
frontmatter-head disk-scan helpers (`frontmatterHead`, `hasClosingFrontmatterFence`) are removed.

## 2026-07-15 — Keep-loaded mode: changes the ⌥⌘A lifecycle-switch semantic when ON (Jan)

> **SUPERSEDED same-day** by the "Load on start + idle-unload owns ALL unloading" redesign above.

**Divergence from the local-LLM PRD §3** ("⌥⌘A is the model's lifecycle switch"): a new machine-level
**Keep loaded in memory** setting (one per model-backed engine — the WhisperKit transcription model in
Voice Models, and the MLX chat model in Assistant) lets the user keep the model resident. Default is
unchanged (load-on-demand). User-requested.

When keep-loaded is ON for the ASSISTANT:
- the model loads at **APP LAUNCH** in the background (never blocks launch/UI) and stays resident;
- **⌥⌘A becomes a pure panel show/hide** — it no longer loads on ON or unloads on OFF (this is the PRD
  §3 semantic change, scoped to the ON state);
- the **idle-unload** timer (PRD §5) is bypassed;
- a **model switch** still unloads the old + loads the new (the "one resident model" invariant holds) —
  with the panel closed, the Assistant pane's active-model change re-runs the background preload for the
  new selection; panel-open additionally verifies the RESIDENT model's identity against the selection
  before adopting it (a stale resident is never adopted under the new selection's name — it reloads);
- flipping the setting OFF reverts to the current lifecycle (unload if no panel is showing; visible
  panels re-arm their idle-unload timer immediately).

When keep-loaded is ON for TRANSCRIPTION: the WhisperKit model prewarms eagerly at vault-open/launch
(background) rather than lazily on first record, and stays resident (WhisperKit already has no
idle-unload). Respects the effective engine — only prewarms when WhisperKit is effective (SpeechAnalyzer
loads no weights), and only when a model is already downloaded (never triggers an implicit download).

Gates (both engines): no preload on unsupported hardware (Apple Silicon gate for the LLM); keep-loaded
is inert when the selected model isn't downloaded (the caption says so); every preload is
failure-tolerant (a failed load logs and leaves on-demand behavior — never a launch crash). The pure
(mode × event) → load/unload/no-op decision for the LLM lives in `LLMLifecyclePolicy` (headless-tested).

## 2026-07-14 — Sidebar Recents SECTION removed (Jan)

Per Jan (product owner): the sidebar's **Recents section is removed** — it is NOT ported to the
NSOutlineView sidebar rewrite. The sidebar is now vault-header chrome + a Pages tree + Tags.

Rationale: Recent rows DUPLICATED Pages rows (the same page appeared twice) and the MRU list
REORDERED mid-gesture, which contributed to the multi-select failures the rewrite fixes (a list that
reshuffles under an active ⌘/⇧ drag is exactly the kind of churn AppKit selection can't survive).

Scope of the removal — **only the sidebar section dies, not the store**:
- The `RecentPages` store and every `recordOpen(...)` call site are KEPT: the ⌘K palette ranks page
  results on recents (`PaletteView`), and `CommandDispatcher` / `DetailPlaceholderView` still record
  opens. A sidebar page-open still calls `recordOpen`, and the sidebar delete-fallback still prefers
  the most-recent survivor (`mostRecentSurvivingPage`) before falling back to the first page.
- The sidebar-side recents plumbing is deleted (the Recent section item kind + rows, the
  `sidebar.recentExpanded` @AppStorage, the `recentNodes` row builder).

Recents live on in the ⌘K palette; revisit a sidebar surface post-rewrite if missed (parking-lot).

## 2026-07-14 — Assistant system prompt: GLOBAL, in addition to the per-model one

**Divergence from the local-LLM PRD §7**, which lists the assistant system prompt as a *per-model*
`SamplingPreset` field. Per Jan's request, the Settings-exposed system prompt is now a single
**global** steering prompt (`LLMPreferences.systemPrompt`) that applies to every model and to every
generation path — chat, ⌘K palette actions, and transcript processing.

Rationale: the field is meant for durable steering like "always output Markdown" / "be concise".
Users think of that as one app-wide setting, not something to re-enter per model; a per-model field
would silently reset on every model switch, which reads as a bug.

- The per-model `SamplingPreset.systemPrompt` is KEPT (round-trips through storage as before) but is
  no longer surfaced in the UI. `ChatMessageAssembler` folds the leading `.system` message in the
  order **global → per-model → mode preamble** (blank-line separated), so both still compose if a
  per-model prompt is ever set again.
- Storage: a new tolerant-decoded `systemPrompt: String` on `LLMPreferences` (empty default; the key
  is omitted from JSON when empty — legacy files decode to "").
- The chat window now renders assistant turns as **block-level Markdown** (native, no new dependency
  — `MarkdownText`), so a "respond in Markdown" instruction is actually formatted, not shown raw.

Not a locked-decision reversal (§ decisions.md is silent on prompt scope); logged here because it
diverges from the PRD build detail. Fold into the local-LLM PRD §7 on next PRD pass.

## 2026-07-13 — LL8 model-management pane: coordinator calls

The LL8 LLM-model Settings pane (mirroring the Voice-model pane) surfaced several calls, decided
here (coordinator) so the coder doesn't guess:
- **Switch-while-loaded policy = DEFER, not cancel.** A `Set as Active` writes the preference
  immediately (the LL7 sampling-preset binding + the "active" pill flip at once), but if a
  generation is in flight the ENGINE reload is queued until that stream terminates naturally, then
  the assistant coordinator calls `generator.load(new)` (the LL2 seam unloads the old model first).
  Silently killing a user's in-flight answer to swap models is worse than a brief stale model. Pure
  decision lives in `LLMSwitchPolicy.decide(assistantLoaded:generating:newModel:loadedModel:)`
  (`.none`/`.reload`/`.deferUntilGenerationEnds`), wired via an `onActiveChanged` hook the (future)
  chat coordinator implements — same staging as LL3/LL7 landed ahead of LL5.
- **Design-language scope.** `design-language.md` is normative for the DETAIL COLUMN. A Settings pane
  is macOS settings chrome, not detail-column geometry; LL8 conforms the type ramp ({11,12,14,18})
  and the ink/accent/amber hue-family rules (which make the pane calmer), but a `controlBackground`
  card container + corner radius is sanctioned Settings chrome. (The existing Voice pane predates the
  language and doesn't conform — LL8 does not inherit that.)
- **Error state = no fourth hue.** A `.failed(message)` row renders the message in `secondary` ink +
  a `Retry` accent button (the affordance carries the "act" signal) rather than introducing a red
  family.
- **Reuse the Voice `ModelRowState`** pure state machine for the LLM pane (don't duplicate a tested
  precedence machine); its doc comment is Voice-flavored but the logic is shared.
- **Mirror `isSafeRepoID` into OutlinerCore** so the Advanced custom-hf-id gate is headless-testable
  (the MLX-side copy stays as the filesystem belt-and-braces). Paste-any-repo hardening
  (cross-revision `.part` validation, HF tree pagination) stays PARKED.

## 2026-07-13 — LL5 chat panel: narrow design-language exemption for interactive controls

`Docs/engine-notes/design-language.md` (NORMATIVE for the right pane) was written for READ-ONLY
reference panes (backlinks, tag-intersection, memo transcript): chrome slots {11,12,14,18}, named
SwiftUI control styles banned, accent-only interaction. The LL5 chat panel introduces genuinely new
interactive chrome the language doesn't enumerate — a **composer text field**, a **model picker
menu**, and **send/stop/regenerate buttons** — whose SwiftUI defaults ride the 13pt system base +
named styles the language bans.

Decision (coordinator): the chat **message/reading surface** (author labels, message body, citation
chips, status hints) is hand-styled to the {11,12,14,18} slots + `Theme` tokens + accent-only
interaction — it abuts the 14pt editor and must match (fully conforms). The **composer / model-picker
/ transport buttons** get a NARROW, documented exemption to use system control styling — same class
as the focus-revealed-syntax exemption already in `design-language.md`. Recorded here (spec tension →
DECISIONS.md, per CLAUDE.md §3) rather than silently diverging. No LOCKED `local-llm.md` decision is
reopened.

**2026-07-14 extension — model-load progress surface.** The composer-exemption class above is extended
to the assistant's **model-load progress indicators**: the status banner's linear `ProgressView`
(determinate when the download fraction is known, else indeterminate) AND the new in-body
`ChatModelLoadingView` shown in the empty-transcript area during `.downloading`/`.loading`. These are
system `ProgressView`s on the reading surface, but they stay in-palette — every bar is
`.tint(Theme.standard.colors.accent)` and all text uses the {11,14} slots on ink (no named styles, no
fourth hue). Same status-strip class the banner already carried; no NEW hue or control style is
introduced. (Added while fixing the bug where the panel didn't react to a Settings model-switch while
open — the composer stayed disabled at `.noModel`; the panel now (re)loads on `selectedModel` change.)

## 2026-07-13 — D23 (proposed): deterministic IDs for anchorless blocks (Jan)

**Bug root-caused this session:** on an adopted Obsidian vault, clicking a tag (or any
backlink) showed nothing. Anchorless external `.md` blocks get their `^ulid` IDs minted
at parse time with a RANDOM ULID. Two independent parse sites — cold-open
`indexFileTransiently` (→ index) and `buildLoadedPage` (→ editor/backlinks load) — minted
DIFFERENT IDs, so `refs.src_id`/`blocks.id` in the index never matched the IDs a re-parse
produced. `backlinkGroups` re-parses each source page and matches `tree.block(refSrcId)`;
every hit dropped → empty tag pages. Reproduced from scratch with current code (fresh
anchorless vault: same block indexed `…CA2B2`, re-parsed `…AD68AC`; #topic backlinks = 0);
and on LNVLT (index `…R15`, file `…AKP10`; 0 hits despite 1327 tag refs). A from-files
rebuild restores backlinks (Design 31, futures 27), proving the files are canonical and
the on-disk index is stale.

**Decision (D23, proposed): make anchorless-block ID assignment deterministic.** When a
block has no `^anchor`, derive its ID as a pure function of `(pageID, preorder-index)`
instead of a random ULID, so any two parses of the same bytes yield identical IDs and the
index can never diverge from a re-parse. Page IDs are already stabilized across opens via
the index's `file_path → id` mapping (cold-open passes it as `pageIDHint`), so the derived
block IDs are stable across opens too.

**Why this over "stamp anchors at cold-open" (option 2, rejected):** option 2 would have
had the cold-open scan WRITE user `.md` files, directly reversing the test-pinned guarantee
from the entry below ("the cold-open scan never writes a user `.md`") and amending D11's
"page ID on first save" timing, plus a bulk vault rewrite (mtime churn) on first open. D23
fixes the same root cause at the source, PRESERVES that guarantee and D11 timing, and never
mutates the user's files — anchorless blocks stay anchorless until a real edit (which then
stamps their derived IDs). Deriving from preorder index is collision-free within a page and
(via pageID) across pages; external reorders before anchoring self-heal via D9's clean-page
reindex.

**`wasNormalized` decoupling:** assigning a derived ID to an anchorless block must NOT flag
`wasNormalized` (that would trigger `buildLoadedPage`'s write-back and dirty the file).
Genuine canonicalizations (anchor case-fix, indent normalize, duplicate-anchor re-mint,
frontmatter colon-fix) still flag it and still write.

**Heal for already-adopted vaults (e.g. LNVLT):** their files already carry (buggy,
random-mint) anchors while the index holds different stale IDs, and incremental cold-open
skips them (unchanged mtime). Ship a one-time forced full reindex gated on an index-version
bump — `coldOpenScan(forceParse: true)` — so the index is rebuilt from the now-canonical
files. Orthogonal to D23 (needed regardless of which fix), so it ships alongside.

**Ships with headless tests** (reader determinism + no-write invariant + heal), per CLAUDE.md.

## 2026-07-13 — Adopt-in-place vault opening: parked M1-T1 pulled forward (Jan)

Jan hit the deferred case live: `Documents/LinerVault` (loose-.md Obsidian-style folder)
opened as an empty vault — `coldOpenScan` only walked `pages/`, indexed 0 pages. The
parking-lot trigger ("revisit when opening an existing Obsidian vault matters") fired;
Jan chose implementing the feature over restructuring his vault. Shipped per PRD §5.1:

- `vault.json → pagesDir` ("pages" default, "." = adopt-in-place), additive field, no
  version bump; sanitizer rejects absolute/`..`/dot-leading components (only the exact
  "." sentinel survives). Scan/create/rename/reconcile all route through the pages root;
  scan skips dot-dirs (`.obsidian`, `.git`, `.outliner`) and root-level `assets/`,
  `snapshots/` in adopt mode. Assets/snapshots/`.outliner` stay vault-root-relative.
- Open flow: loose `.md` + no `pages/` + no `vault.json` → three-way prompt (Treat as
  pages/ · Create Vault Structure · Cancel). Adopt persists `pagesDir "."` BEFORE Vault
  construction; a save failure ABORTS the open (proceeding would scaffold an empty
  `pages/` and silently hide the user's notes). A stale `.outliner/` without `vault.json`
  (a prior failed open — Jan's actual state) still prompts.
- **`memosDirectory` semantic change:** stored value is now pages-root-relative
  (default flipped "pages/memos" → "memos"); a back-compat shim strips an already-present
  pages prefix so legacy stored values resolve identically (pinned by tests). Default
  vaults are byte-identical on disk; adopt vaults put memos at `<root>/memos/` so they
  index. `MemoOptions.memosDir` (the fully-resolved form) keeps its "pages/memos" default.
- Guarantee (review-verified, test-pinned): the cold-open scan never writes a user `.md`
  — ID-normalization write-back remains exclusively in the editor-open path. format.md
  §1/§2 gained one-line `pagesDir` notes (spec was default-layout-specific, not wrong).
- Pipeline: design → code → independent review, verdict APPROVE (two
  stronger-than-design deviations kept: sanitizer hardening, abort-on-save-failure).

## 2026-07-13 — P4 local LLM opened: mlx-swift approved + SP1 GO (measured)

**Dependency approval recorded (convention #8):** `mlx-swift-lm` (MIT, pinned .exact
3.31.4 — its own release notes flag main as churning), `mlx-swift` (MIT, 0.31.x),
`swift-transformers` (Apache-2.0, already in-graph via WhisperKit) — approved by Jan in
the local-llm PRD §13 (2026-07-12, 2acaefd); recorded here at first commit. All
permissively licensed. Spike model: Qwen3-1.7B-4bit, Apache-2.0.

**SP1 retired — GO, measured on the M4 Max:** load 1.5s; EN 61.8 tok/s, JA 57.4 tok/s
(D7 smell-test passes, coherent Japanese); unload returns RAM (RSS 1057→137 MB) and GPU
(923→0 MB) — the ⌥⌘A lifecycle contract is physically sound. Build impact: +1.0 GB
.build, ~+80s cold build, confined to the LLMSpike target (swift test runner time
unchanged; quarantine proven).

**Three build-environment findings that gate the phase:**
1. `swift build` CANNOT produce MLX's Metal shaders (upstream limitation) — MLX code
   only runs from xcodebuild-built binaries. The app already builds via xcodebuild;
   any `swift run`/`swift test` MLX path will abort at runtime (metallib missing).
2. Xcode 26's Metal Toolchain is a separate one-time ~688 MB download
   (`xcodebuild -downloadComponent MetalToolchain`) — dev-setup/CI-image item.
3. swift-transformers 1.1.9's HubApi.snapshot has a 10s per-request timeout that
   reliably kills ~1 GB weight downloads on normal links — the ship engine (LL3) must
   use a longer-timeout/resumable session; the spike works around it with a pre-fetch.
   Also: mlx-swift-lm 3.31.4's MLXHuggingFace macros are mid-migration/unbuildable —
   the spike bridges Hub+Tokenizers directly (HubBridge); re-evaluate upstream at LL3.
4. (Found at LL3 landing) Once the APP links mlx-swift, xcodebuild trips Xcode's
   package-plugin trust gate ("Validate plug-in CudaBuild") from any fresh project
   path — every xcodebuild invocation (dev, CI, coordinator gates) now needs
   `-skipPackagePluginValidation -skipMacroValidation` (standard for exact-pinned
   deps; ours are). Without the flags the app build FAILS despite correct code.

**SP3 (16 GB RAM envelope) cannot be measured on this 128 GB machine — Jan-morning item
on real hardware.**

## 2026-07-13 — CR6 scope: pause/resume deferred out of the CallRecorder facade

PRD §3.2 lists a pause control in the call transport. CR6 ships **stop/cancel only**:
pausing a two-track recording means CallWriter's staging-ring frame alignment must
survive a capture gap (does the gap become zeros on both tracks, or does time simply
skip?), and the PRD doesn't say. That is a real design question, not an implementation
detail — guessing it into the facade would bake in an alignment semantic nobody chose.
Deferred to its own sub-task after Jan picks the gap semantic; the CallRecorder state
machine (idle/recording/finishing/finished/failed) was shaped so a `paused` state slots
in without breaking the seam. Also per the same design review of PRD §3.2: the call-end
auto-stop grace timer (open Q1) lives in the CR9 view-model, not the recorder — CR6
exposes `stop()` and stays timer-free.

## 2026-07-13 — Call recording (P3, overnight first waves): format addendum + findings

**§9 format addendum (routes here, format.md untouched per the PRD's spec-edit rule):**
call memos are ordinary `pages/memos/` pages whose frontmatter adds `kind: call`,
`source_app: <bundle id>`, and the speakers map **flattened** to ordered top-level keys
`speaker_<key>: <display>` (e.g. `speaker_me: Me`, `speaker_s1: Speaker 1`) — NOT the
nested YAML block the §9 sample illustrates. Reason: the model's `Frontmatter` is a flat
first-colon `key: value` line store with no nested-map support, and a nested block cannot
round-trip byte-stably (S4). Stable keys + display names are fully preserved; only the
on-disk shape differs. Blocks carry `spk:: <key>` via the existing property-drawer
grammar (no new syntax). `me` seeds as neutral "Me" (the §9 sample's "Jan" is a display
name the user sets by renaming on the page). When format.md is next edited by Jan, the
memo section should document `kind`, `source_app`, `speaker_*`, and `spk::`.

**SpeechAnalyzer (CR4) findings worth permanence:** on-device FILE transcription is
PROMPT-FREE on macOS 26 (R3 resolved — no Speech TCC for local-asset file analysis);
the locale MUST be `AssetInventory.reserve`d before analyzer construction or analysis
dies by UNCATCHABLE SIGTRAP (reserve returns false = already-reserved, verified by
probe); results are natively sentence-granular with per-word `audioTimeRange` runs;
the one-shot buffer pattern carries a real transient-memory ceiling (~1.5 GB/h worst
case) — a 4h clip guard ships, chunked feeding is the parked follow-up (blocked on the
observed multi-buffer nilError).

**Still gated:** CR5 (the real ProcessTapRecorder) waits on Jan's morning P3Spike SP1
run — sandbox go/no-go is THE feature gate (D13 locked; NO-GO escalates here, never
unsandboxes). FluidAudio remains ask-first-unapproved; the Diarizer seam (CR7) ships
with the Me/Them fallback ladder and no conformer.

## 2026-07-13 — Graph view (overnight build): d3-port deviations + provisional calls

Recorded by the coordinator during the autonomous overnight run (Jan's directive: graph
view → call recording → LLM; PRDs are the contracts). Graph PRD §7 locks the d3-force
parameter set; the build surfaced four engineering deviations, all documented in-code and
review-verified as shape-safe:

1. **`recenterToOrigin` added after integrate** (d3 forceCenter semantics) beyond the
   enumerated five forces — the layout's centroid drifted ~670pt and warm-starts
   translated every node, breaking §10/C4. Translation-only ⇒ settled SHAPE identical to
   the ported set. Known artifact: recenter skips while a node is pinned, so a long drag
   accumulates drift released as one visible pop on mouse-up (v1 accepted, noted in-code).
2. **`warmStartAlpha` 0.3 → 0.1** — SP3-sanctioned tuning (untouched-node displacement
   83/42pt at 0.3 vs 39/19pt at 0.1 against the 45/22.5 C4 thresholds); new-node
   settle-quality separately asserted.
3. **Collide impulse ~half of d3's** (separation folds through velocityDecay rather than
   d3's post-decay position op) — stable, softer collision; deliberate simplification.
4. **Drag-release decay ≈4s** (standard d3 alpha decay from 0.3), not the PRD's "~2s
   LogSeq feel" — determinism kept over feel; revisit only if Jan notices.

**SP2 evidence (measured):** a literal 200-way star (a big tag hub) settles a leaf shell
of mean ≈338pt (min ≈200, max ≈427) at the locked constants — ≈1.9× linkDistance, wider
than the PRD's guessed [0.5,2.0]× band; settles in exactly ~300 ticks, no instability.
Whether dense-tag hubs warrant constant tuning is **Jan's call**; data pinned in
`testSP2LiteralStarShellEnvelope`, constants untouched.

**Provisional (pending Jan):** graph entry keyboard shortcut ships palette-only (⌘⇧G is
conventionally Find-Previous — not claimed without Jan); SP1 (Canvas 60fps at 2k/6k)
cannot be measured headless — rung A implemented, bench harness included, the gate run is
a morning item.

## 2026-07-12 — ⌘U underline: refused (Jan — "Markdown purity takes priority")

The D20 mark set stays `bold/italic/code/strike`; ⌘U remains deliberately unbound
(`OutlineView+Input.swift` keyDown note). Markdown has no underline syntax — shipping it
would mean a `<u>` inline-HTML grammar extension (byte-stability cost, PRD §21 risk) — and
the design language reserves underline for one meaning (dashed = unresolved wikilink).
This is a refusal, not a deferral: no parking-lot row. Revisiting requires reopening this
entry.

## 2026-07-12 — Ship vehicle decided: M5 engine ONLY; Fallback A purged (Jan)

**Supersedes D14 (Fallback A container) as ship configuration** and closes the standing
engine-vs-Fallback ship-vehicle call (the M5 gate already recorded the engine winning
S2/S3). Jan, 2026-07-12, at the v0.1.0-alpha milestone: "commit to the M5 engine, purge
the dead code." The editor.md fallback ladder remains as history; Fallback A is no longer
buildable — `Sources/OutlineEditor/Fallback/` is deleted, the `EditorEngine` A/B flag and
`-useCoreTextEngine` launch argument are removed (launch is plain `open Enliner.app`).
Shared code that happened to live under `Fallback/` was relocated, not deleted:
`RowGeometry` (canonical design-language geometry → `Layout/`), `StructuralKeyMap`,
`AutocompletePopover`, `LinkPreviewChip`, and the `EditorSelection` enum (extracted to its
own file). Behavioral test coverage (IME corpus, AX, clipboard, drag) is preserved by the
engine-native twins; only container-specific Fallback suites were deleted.

**Also recorded (same day, superseding an earlier verbal "no bullets is fine"):** Jan's
final call is that headings are lines like any other — heading rows DO get outline
bullets. Root cause of the missing H1 bullet was never metric math: `.heading`
deliberately returned nil from the engine's `adornmentGlyph` (and Fallback hid it in
`configureAdornment`); both folded into the `.bullet` case in 6375ca4 (`.plain` stays
bulletless). Landed via the typography stream before the purge.

## 2026-07-12 — Tag pages: materialization codified + LogSeq-style hybrid layout (Jan)

**Spec-gap closure (no format change):** a tag page materializes to `pages/<name>.md`
like any page — `createPage` mints the real ULID id and `IndexWriter.reconcilePlaceholder`
atomically rewrites the tag's refs from the deterministic placeholder id onto it. This was
always the code's behavior (database.md anticipates the row promotion) but neither
format.md nor database.md said where the `.md` lands; recorded here rather than editing
locked specs. Now user-reachable via the tag page's "Add notes…" (materialize-on-reveal —
materialize-on-TYPE was investigated and rejected: neither engine can render/focus an
empty tree, and a "ghost block" means engine surgery).

**Hybrid layout (Jan, 2026-07-12):** a REAL page whose name matches a used tag renders
the LogSeq-style hybrid — `#tag` title, auto-height embedded notes editor (44…480pt) on
top, Linked References ALWAYS below (⌘⇧B is a visual no-op there). Routing is live and
name-based (`TagPagePresentation.isTagNamed`, D8 normalize), with two accepted
LogSeq-identical consequences: a page named `swift` flips to hybrid when the first
`#swift` appears anywhere, and renaming a materialized tag page DIVORCES it from the tag
(page keeps its notes as a normal page; the next `#swift` re-creates a placeholder).
Occurrence-rewriting tag rename stays in the parking lot.

## 2026-07-11 — M7 build progress (overnight, autonomous) + framework carve-out

M7-T1..T4 landed on `m5-engine` (T1 spike, T2 recorder, T3 transcriber, T4 memo-page
creation); T5 (recorder UI) in progress. Both real unknowns retired by T1 on hardware:
sandbox AUHAL capture works to the TCC gate (one-click morning grant); WhisperKit `base`
transcribes EN and — critically for D7's bilingual vault — **JA as Japanese** (the T1
"defaults to English" gotcha is closed by setting `detectLanguage: true` explicitly).
Measured: cancellation ~25 ms; no network egress once the model is cached (V5).

**Framework carve-out (§2.1 extension, mirrors the Snapshotter/WebKit exception):**
`Sources/OutlineModel/Voice/WhisperKitTranscriber.swift` imports WhisperKit inside the
model package. This is the SAME sanctioned pattern as `Assets/Snapshotter.swift` importing
WebKit: a heavy system-ish framework confined to ONE file behind a Foundation-only
protocol (`Transcriber`), the concrete impl **injected app-side** (VaultController), never
constructed in the model. WhisperKit is neither AppKit nor SwiftUI. Recorded here so the
`import WhisperKit` in `OutlineModel/` reads as a deliberate carve-out, not drift.

**Model-size default (`base`, ~140 MB bundled floor):** approved provisionally overnight
on "a floor that works beats a smaller floor that doesn't" + T1's JA evidence
(`tiny` JA is garbage). The 140 MB model file is NOT vendored into git; the download path
is the working route, the bundled-fallback mechanism is wired. **Jan's morning call**
whether DMG size warrants `tiny` (a one-line `variant:` change).

**Audit data-loss guard extended:** a memo references its `.m4a` only via the `audio:`
FRONTMATTER key (no inline mark), so `Vault.referencedHashesAndURLs()` was extended to read
frontmatter `audio:` for both loaded AND unloaded pages — otherwise Audit Assets would have
offered every recording for deletion. (M4-T5 data-loss guard, now covering audio.)

## 2026-07-10 — M7 voice memo added to the pipeline (reopens two locked decisions)

**Decision: schedule voice memo as M7** (`Docs/phases/M7-voice-memo.md`) — record →
on-device transcribe → static memo page. Per Jan's directive ("dual notetaking / dictation
tool… add to the pipeline"). Scope is deliberately bounded to (a) record → transcript for
copy/paste; **not** live dictation-into-editor (M5-adjacent, deferred) and **not** AI
summarization (a later, separate PRD that attaches a summary page).

This **reopens two locked decisions** — recorded here, enacted at M7 build/ship, not now:
- **Audio non-goal (overview.md:18 "video/audio embed").** Reframed, not lifted: audio-embed
  (audio as playable content) stays refused; **audio-as-capture** (audio produces blocks; the
  outline is the product) is in via M7. The overview.md edit lands when M7 starts.

**Locked build forks (2026-07-10):** WhisperKit (MIT, SPM) for transcription · copy the
AUHAL recorder *subset* (drop mediaremote-adapter muting / screen-context / cloud+streaming
providers) · keep `.m4a` (content-addressed in `assets/`) · land as a `pages/memos/` page.
New deps (both ask-first, convention #8): **WhisperKit**, **swift-atomics**. Load-bearing
unknowns to retire in M7-T1: AUHAL device enumeration/capture under App Sandbox (D13), and a
WhisperKit round-trip on real hardware.

### 2026-07-11 — M7-T1 de-risk spike findings

Spike harness lives in `Sources/M7Spike/` (standalone `M7Spike` executable, not shipped;
`Sources/M7Spike/README.md` documents re-running). VoiceInk (GPL-3.0) cloned to scratchpad and
its `AudioDeviceManager` / `CoreAudioRecorder` studied; the AUHAL subset is a faithful, minimal
port. Deps resolved: **WhisperKit 0.18.0**, **swift-atomics 1.3.1** (transitively pulls
swift-transformers, swift-crypto, swift-collections, yyjson, jinja, argument-parser — all
MIT/Apache). `swift build` clean; **full `swift test` green** (1371 Swift-Testing tests / 151
suites + 390 XCTest, 0 failures, 4 pre-existing known issues — WhisperKit broke nothing).
`xcodegen` + `xcodebuild` build the app with the new entitlement.

**Unknown 1 — AUHAL enumeration + capture (D13): RETIRED (up to the TCC gate).**
- Enumeration works and needs **no** microphone TCC (device topology is not TCC-gated). The
  spike listed 4 input devices (built-in mic default + USB + 2 virtual) via
  `kAudioHardwarePropertyDevices` filtered by input-scope `StreamConfiguration` (VoiceInk's
  exact filter).
- The full AUHAL input graph (HAL output unit, EnableIO input, set device, native format,
  input callback, Initialize, **Start**) builds and starts (`AudioOutputUnitStart` → noErr) and
  the render callback fires with `AudioUnitRender == noErr` — i.e. **capture works end-to-end at
  the API level**. (Observed unsandboxed via `swift run`, where the parent terminal already
  holds mic TCC; the Core Audio HAL calls themselves are not sandbox-blocked — only the mic data
  stream is TCC-gated.)
- **Morning one-click item:** first real capture from the *sandboxed* signed bundle triggers the
  system microphone prompt carrying `NSMicrophoneUsageDescription`. Added this commit:
  entitlement `com.apple.security.device.audio-input` (`Outliner.entitlements`) + the usage
  string (`Info.plist`). Without the entitlement a sandboxed build cannot even request the
  permission (silent denial). Grant once → capture is live for bundle id `com.enliner.app`.

**Unknown 2 — WhisperKit round-trip: RETIRED.** `say` + `afconvert` produced EN/JA samples
(`.m4a` AAC for storage, 16 kHz mono Int16 WAV for transcription — no mic needed).
- **Model choice:** `tiny` (73 MB on disk) and `base` (140 MB) both downloaded + ran. Load 4–5s
  warm, 20–30s cold (download). Transcribe ~0.7s for an 11s clip. **Recommend `base` as the
  bundled/default model** (tiny's accuracy is marginal); revisit `small` if JA accuracy demands.
- **Segment shape (feeds T3):** `TranscriptionResult.segments[]` each carry `.start`/`.end`
  (Float seconds, clean VAD/token boundaries) and `.text`. **Gotcha:** `.text` embeds Whisper's
  special tokens inline — `<|startoftranscript|><|en|><|transcribe|><|0.00|> …<|4.80|>`. **T3
  MUST strip `<|...|>` tokens** before making blocks (use `.start`/`.end` for the optional
  `t::` timestamp, never parse them out of `.text`). EN transcript was clean with correct
  punctuation/casing → one block per segment maps directly.
- **Download path gotcha (T3):** WhisperKit's `HubApi` downloads to `~/Documents/huggingface/…`
  by default — a **sandboxed app cannot write there**. T3 must point WhisperKit at the app's
  container (Application Support) via `WhisperKitConfig.downloadBase`/`modelFolder`, and ship the
  bundled fallback model inside the app bundle for first-run offline.
- **V5 (no egress during transcribe): CONFIRMED.** With the model pre-cached and the process run
  under the network-denied sandbox, transcription completed normally (0.66s). Download and
  transcribe are cleanly separable — T3's `Transcriber` should surface a "model ready" state so
  the UI only transcribes offline.
- **Bilingual EN/JA (D7) — SURPRISE, reshapes T3:** both `tiny` and `base` **default to
  detecting `en`** and transcribe Japanese audio *as romanized/hallucinated English* (JA sample
  came back as garbage English). WhisperKit's default task is `.transcribe` assuming English;
  language `auto` is **not** the out-of-box default. **T3 must explicitly enable language
  detection** (`DecodingOptions(detectLanguage: true, language: nil)`) or take the language from
  vault/frontmatter, and should verify JA quality on a larger model — do **not** assume `auto`.

**Deviations from the task brief:** (1) The spike is one executable target (`M7Spike`) rather
than a debug harness folded into the app — keeps it out of `Sources/Outliner/` and the
sidebar/editor files another agent is touching; T2 can fold the capture probe into the app to
get the *sandboxed* run. (2) Sandboxed capture was proven at the entitlement/Info.plist +
Core-Audio-API level, not by an end-to-end signed-bundle mic grant (owner asleep, TCC ungrantable
tonight) — this is the sanctioned one-click morning item. (3) `swift run` executes unsandboxed;
the network-denied transcribe run stands in for the "network blocked" V5 check.

## 2026-07-09 — M5 GO/NO-GO (the M4 decision gate)

**Decision: GO — M5 proceeds on branch `m5-engine`, per Jan's explicit directive
("Develop M5 on a branch so that we can compare").** The v1 ship-vehicle choice (custom
engine vs Fallback A) is NOT being made here — it lands at M5's own gate, using the branch
comparison Jan asked for. Honest Fallback A status against the criteria:
- **S2 (keystroke-to-glyph ≤16 ms @10k):** model-side apply path measured at p95 ≈ 2 ms
  with 5 live queries on the 10k fixture (S2GuardTests). The full keystroke-to-PAINT
  number on real hardware (PRD §16 signpost methodology, AppKit layout included) has NOT
  been measured headlessly — it is the load-bearing unknown M5 exists to beat, and it
  needs Jan's hardware for an honest baseline.
- **S3 (structural round-trip, no cursor jump, ≤1-frame reflow):** functionally correct
  and regression-tested (caret restore, goal columns); frame-level reflow timing likewise
  not headlessly measurable.
- Everything functional is green: S1/S4/S5 gates recorded in earlier phases; S6/S7
  scripted in M4-T6. Fallback A is a complete, shippable editor — M5 misses its gate ⇒
  v1 ships on Fallback A (the pre-planned contingency, parking-lot).

## 2026-07-09 — M4 COMPLETE — gate green (automated), manual smoke pending

All six tasks landed (T1 AssetStore ‖ T2 link previews ‖ T3 Snapshotter in parallel
worktree pipelines → T4 auto-snapshot → T5 audit assets → T6 scripted S6/S7 gate).
946 swift-testing (107 suites) + 316 XCTest green; app target builds; CI green.
Review pipeline record: T1 took THREE rounds — the paste-while-typing embed race was
found by review twice (ingest-await window, then the narrower enqueue-to-run window);
closed with chain-serialized embed + staleness gate + bounded re-enqueue. T4/T5/T2/T3
each had review findings fixed pre-merge (live glyph refresh; audit URL normalization —
a still-glyphed snapshot could be offered for deletion; T6's gate fixture lacked teeth).

**Notes and intentional gaps (none reopen a locked decision):**
- **Remote-image localization (PRD §11.1, Q5-gated `![](https://…)` → `assets/`) is NOT
  in v1 yet.** It is a separate ingest pipeline with T1's embed-race hazard class; T1
  ships the provenance API (`sourceURL:`), T4 ships the Q5 setting, but nothing triggers
  the fetch. Consequence: with auto-snapshot ON, remote image URLs snapshot but don't
  localize. Flagged to Jan for prioritization.
- **Snapshot capture rows are intentionally non-rebuildable derived state:** after an
  `.outliner/` wipe the `.html`/`.webarchive` FILES survive (S7 holds — pinned by test)
  but the capture row and archive glyph do not rebuild from `snapshots/` files.
  Re-snapshotting restores them. Pinned both directions in S7VerificationTests.
  **SUPERSEDED 2026-07-15 (v0.1 archiving close-out, Jan's call):** snapshot capture rows
  now DO rebuild from disk on cold open. The sha256 filename is one-way, so rows are
  re-derived from PAGES × FILES — every page-referenced link URL is canonicalized, its
  deterministic `SnapshotStore.paths(forURL:)` recomputed, and when a `.html`/`.webarchive`
  file survives at the vault root the `assets` capture row is re-upserted
  (`Vault.healSnapshotAssetsFromDisk`, gated `forceParse || indexRows.isEmpty` — cold DB /
  forceParse heal / rebuildIndex, never a warm incremental open). An ORPHAN snapshot (file
  present, no page links it) is deliberately NOT resurrected (derive-from-pages semantic,
  matches the asset-audit philosophy). The persist/heal hash agreement across the double
  `URL(string:)` round-trip is a verified `absoluteString` fixpoint. S7VerificationTests'
  `snapURL` is an unlinked orphan, so its assertions now document the negative path; the
  positive rebuild is pinned in SnapshotRebuildTests. Closes the durability gap so "the
  vault is offline-complete" (S7) actually holds after an index rebuild.
- **Audit "index join" interpretation:** image paths live in inline marks (not indexed),
  so the audit is assets rows MINUS a content scan (in-memory trees for loaded/dirty
  pages — the data-loss guard — plus transient no-LRU parse for unloaded pages).
- Snapshot capture rows reuse the `assets` table with `hash` = sha256(url) first16hex
  (a URL hash in a content-hash column — database.md's `snapshot_path` comment
  anticipates capture rows; documented on the inserting SQL).
- Parked hardening (parking-lot.md): link-preview socket teardown + SSRF guard; flattener
  substitution-safety vs base64 collisions; paste-during-IME embed skip (silent, no text
  loss, orphan is auditable); preview-cache re-eviction.
- CI toolchain stricter than local on MainActor inference (QL panel-control overrides) —
  fixed with the codebase's assumeIsolated pattern; perfSmoke ceiling raised 500→1500 ms
  (load-flake, measured gate lives in S2GuardTests).

## 2026-07-09 — M3.5 COMPLETE — gate green (automated), manual smoke pending

All five tasks landed (T1 parser/compiler/engine → T2 derived rows in the model contract →
T3 Fallback A rendering/editing → T4 {{ insertion UX → T5 propagation + S2 guard).
929 swift-testing + 206 XCTest green; app target builds. Gate: every D22 grammar production
correct against fixtures; derived-row edits round-trip to source (file bytes + index + a
second window, asserted per edit type); measured S2 guard p95 ≈ 2 ms vs the 16 ms budget
with 5 live queries on the 10k fixture; cap 100 + "show more" wired. Manual smoke pending:
`Docs/ManualSmoke-M35.md`.

**D22 flags resolved during build (all within the frozen grammar, none extend it):**
- Explicit operators ONLY — adjacency (`tag:#a tag:#b`) is a parse error, not implicit
  `and`. Keeps the grammar unambiguous and the error row honest.
- Deterministic result ordering: `page_name ASC, page_id ASC, ord ASC, id ASC` (total
  order; stable across re-runs).
- Query expression is extracted from the SERIALIZED block markdown, not the mark-consumed
  visible string — `link:[[Page|alias]]` queries the page, not the alias.
- SQL is parameter-bound everywhere (binding-count == placeholder-count asserted);
  FTS-vs-LIKE routing shares ⌘⇧F's single rule (`IndexQueries.usesFTS`, grapheme-measured).
- T3 UI-gate invariant: structural commands routed at a source id DO mutate the source
  page (correct model routing) — the UI must gate them off derived rows. Review found and
  closed FOUR data-loss holes here (paste-forest, menu structural ops, crossText delete,
  foreign-tree undo presentation); ForeignTreeGuard also closed a pre-existing vault-wide
  cross-page undo presentation bug.
- **Known gap (scoped out, revisit before v1):** editing a source page in one window
  updates other windows' DERIVED rows (via indexTick) but not another window showing the
  SOURCE page itself — that cross-window source-editor propagation predates M3.5 and is
  unchanged by it.

## 2026-07-09 — M2 COMPLETE — gate green (automated), manual smoke pending

All six tasks landed on Fallback A (T1 editable rows → T2 structural keys → T6 write
pipeline/conflicts → T3 selection model → T4 marks-as-you-type → T5 clipboard+drag).
515 tests / 71 suites green; app target builds. Gate: every editor.md keyboard action is
wired to a Command; caret crossing/goal-column live; rapid-edit data loss covered by the
drain-never-drop CommandChain + conflict tests (D9). The review pipeline caught blocking
bugs pre-commit in FOUR of six tasks — including two outright data-loss paths (typed-text
loss on page switch in T1; delete-without-paste on full-page paste-over in T5). Remaining
sign-off is the human ManualSmoke-M2.md pass (IME/Japanese composition above all — it has
no headless coverage on Fallback A).

## 2026-07-09 — M2-T5 notes (clipboard + drag)

- **Review caught a real data-loss bug pre-commit:** paste over a whole-page block
  selection deleted everything and pasted nothing (the insert's anchor was inside the
  deleted set). Fixed by making insert-first-then-delete the ONLY paste-over order — the
  anchor is always alive at insert time. Cut is now transactional: the delete fires only
  after the pasteboard write demonstrably succeeded, and targets exactly the serialized
  roots.
- **applyInsertBlocks validates parentMap parents-first in one pass** (catches
  non-parents-first listings and cycles → .empty, never a precondition crash).
- **Accepted quirks / follow-ups (review #3/#5/#6/#7, non-gating):** crossText cut copies
  whole blocks but deletes partially, so cut→paste re-duplicates the anchor's kept prefix;
  paste-over caret lands at the delete's hint (previous survivor), not end-of-paste, because
  deleteBlocks runs second; no validateMenuItem on the list (Copy/Cut/Paste always enabled
  when list is first responder — no-ops safely); SubtreeSerializer's anchor stripping is
  coupled to the 26-char ULID width; dragging the row you are editing may not carry the
  caret to the new position (content-safe).
- **Foreign-Markdown DROPS are out** (only the own block flavor is a registered drag type);
  foreign content arrives via paste. Consistent with the always-mint decision.

## 2026-07-09 — M2-T4 notes (marks-as-you-type)

- **`Command.replaceBlockText` added** (atomic whole-InlineText swap, one undo step, never
  coalesced) — backs every trigger consumption; spec'd in model-types.md.
- **Trigger token lifecycle (review-driven):** the ⌫-revert token and pending marks are
  cleared by any edit, any caret motion (keys or mouse via textViewDidChangeSelection),
  focus change, structural key, undo/redo from any path, and page switch/zoom. Revert gates
  on token+block only — never on a caret offset, which races the async reconcile.
- **Detection fires only on single-scalar keystroke commits** — a paste ending in `*` can
  never consume delimiters from pasted content.
- **Lexical contract accepted:** `a_b_` + `_` italicizes "b" (snake_case victims use
  ⌫-revert); word-internal-underscore suppression deferred.
- **Known non-blocking follow-ups from review** (do with M2 polish or M5): setMark on a
  selection collapses it (caretHint = hi) so double-toggling needs reselect; style triggers
  can fire inside an existing `code` span; undo caret after a mark-trigger revert lands
  mid-delimiter; `]`/`.` sit unused in the row-completer gate.

## 2026-07-09 — M3 COMPLETE — gate green (automated), manual smoke pending

All six tasks landed (T1 ref rendering → T2 autocomplete → T4 backlinks → T5 search →
T3 block-ref previews → T6 palette) plus mid-phase product iterations from live smoke
(toolbar search rework ×3, zoomed-title editability, backspace un-consumption, hover
cursors) and the D1 two-space parser fix. 676 swift-testing + 204 XCTest green; S5 backlink
gate green on the 10k fixture; S1 unchanged. Reviews caught blocking issues pre-commit in
FIVE of six tasks (trailing-click activation, orphaned popovers, WindowModel handler
clobber, search-jump undo pollution + missing drain, preview height clipping + a latent
crossText corruption path). Remaining sign-off: the human ManualSmoke-M3.md pass —
autocomplete triggers with Japanese IME suppression above all.

## 2026-07-09 — ⌘K arbitration RESOLVED (parked since M2-T4) + palette decisions

- ONE live ⌘K chord, owned by the new registry command `openPalette` (Go ▸ Command
  Palette…): with a text selection it performs Link (the old Format binding); without one
  it opens the palette. `insertLink` stays in the Format menu but shows no accelerator —
  the honest tradeoff of one context-sensitive chord (PRD §5.4/§7 both want ⌘K).
- Palette: page mode default (recency-ordered), `>` prefix = command mode over the full
  registry via the SAME dispatch as the menus (new CommandDispatcher — one switch, D18);
  unavailable commands are HIDDEN (the menu keeps the dimmed affordance); create-on-⌘Return
  is page-mode only; command-usage frequency ranking parked.
- Backspace mark un-consumption (Jan, live smoke): ⌫ at a consumed mark's trailing edge
  re-materializes the literal delimiters minus the eaten one ([[link] …) — the documented
  inverse of D20 consumption; blockrefs delete atomically. Retyping the closing delimiter
  leaves literal text until reload/re-accept (accepted asymmetry, parked).

## 2026-07-09 — D1 grammar clarification: markers beat continuations

The D1 grammar was ambiguous in two-space files: a depth-1 child (`  - x`) and a parent's
continuation line (indent+2 spaces) have byte-identical prefixes. The reader resolved it
as continuation — silently flattening ALL nesting in two-space/four-space (Obsidian-style)
files, byte-stably (the M0 byte gate could not see it; discovered during M3-T4 test
authoring). Clarification adopted: **a line whose de-indented content parses as a list
marker is a CHILD, never a continuation/drawer line.** Mirror-side: the writer now escapes
marker-shaped soft-break text (`\- foo`, `3\. foo` — the `\::` drawer-escape precedent) so
genuine soft-breaks can't round-trip into phantom children. Canonical fixtures unchanged
byte-for-byte; the only byte change is the pathological marker-shaped-continuation case.
Follow-ups parked: fuzz generator two-space + marker-lookalike coverage; canonical corpus
block-count assertions; escape-the-escape invariant pin.

## 2026-07-09 — M2 SIGNED OFF (Jan, live smoke pass)

Human smoke pass complete: "all good." The pass surfaced and we fixed 9 issues pre-sign-off
(welcome→main handoff, empty-page dead end, D9 self-echo storm, dead Return, repeated-Enter
override, adornment first-line alignment, chrome observation, ⌘N binding, inline new-page)
plus two pulled-forward features (page rename, Enliner branding). M2 gate fully green.
M3 (linking + backlinks) starts now.

## 2026-07-09 — Q7 RESOLVED: the app is named Enliner (Jan)

- Display-level rename only: product/bundle = Enliner.app, bundle id com.enliner.app,
  user-facing strings updated. Code codename stays `Outliner` (targets/modules/scheme
  unchanged — CI untouched). Icon reused from garddn (`icon-512x512-maskable.png`, full
  bleed); the 1024 slice is an upscale — a true 1024 master is wanted before release.
- Bundle-id change resets the defaults container: the vault registry (recents + bookmarks)
  starts empty once; re-open the vault.

## 2026-07-09 — Page rename pulled forward from M3 (Jan, live smoke)

- `Vault.renamePage(id, to:)`: file move (namespaced names nest), index row update keyed by
  the stable ULID, cache path update; content hash untouched so the rename's FSEvents pair
  (old path gone / new path appeared) is self-suppressed by the D9 identity fast-path — no
  conflict, no reload. A dirty page's pending edits flush to the NEW path.
- Sidebar rename is inline (same Finder-style idiom as new-page); one inline editor at a
  time. Sheet-era "Rename… (disabled — M3)" stub retired.

## 2026-07-09 — Return on empty top-level block: no-op → new sibling (Jan, live smoke)

PRD §6.1's empty-block ladder made Return on an empty TOP-LEVEL block a consumed no-op;
in live use that reads as "Enter stops working after one new line". Jan's call: repeated
Enter must keep creating rows. The empty-top-level rung now emits splitBlock(at: 0) —
model-side this inserts the new empty row above with the caret staying in the (empty)
original, visually identical to "new row below, caret in it", and it chains indefinitely.
The nested-empty → outdent rung is unchanged. editor.md keyboard table updated with a
pointer here.

Same session, same source: row adornments (bullet/number/checkbox/chevron) now pin to the
FIRST line of a wrapped block instead of the row's vertical center (RowGeometry
.firstLineCenterY, derived from the row's first-line font metrics — exact single-line
degeneracy, headings center on their taller first line). Child-count pill stays
row-centered (trailing chrome, not an adornment).

## 2026-07-09 — M2-T5 clipboard decisions (design-stage, adopted)

- **Paste always mints new block IDs** (own-flavor included). PRD §6.3's "move if cut,
  duplicate if copied" collapses cleanly: cut fires `deleteBlocks` immediately, so by paste
  time the source is gone and re-creation with fresh IDs *is* the move. Preserving IDs on
  copy-paste would violate ULID uniqueness (same page) or create two-pages-one-block identity
  hazards (cross page). Drag-reorder remains a true move via `reparent` (no IDs change).
- **Clean-Markdown pasteboard flavor strips `^id` anchors** (PRD §6.3 verbatim: copies are
  new content) **but preserves `key:: value` property drawers** — properties are user
  content, not identity; foreign apps ignore the extra lines; our own paste re-parser
  round-trips them.
- **One new model command, `Command.insertBlocks`** (atomic forest insert, one undo step),
  spec'd in model-types.md. Everything else reuses deleteBlocks (cut), setMark(.link)
  (URL-over-selection), reparent (drag).
- **Accepted two-undo-step limits** (matching the logged CrossTextDelete limit): paste-over
  an active block selection = deleteBlocks + insertBlocks; crossText cut likewise.
- **Drag origin is the row adornment** (bullet/checkbox/number) via a manual dragging
  session — NSTableView row-dragging fights per-row NSTextView first-responder and cannot
  express the depth-following drop indicator.

## 2026-07-09 — M2 T1/T2/T6 notes

- **Editing pipeline (T1):** view-optimistic echo + async serial CommandChain that DRAINS
  (never drops) on page switch; mismatch-reconcile + focused-row rule + CaretHintPolicy
  gate all model→view writes. Review caught typed-text loss on page switch and a stale
  caretHint caret-jump pre-commit.
- **Fold/unfold menu chords deviate from the contract's ⌘./⌘,** → ⌘⌥./⌘⌥, (SwiftUI's
  Settings scene owns ⌘,; ⌘. is the system cancel key). The ⌘./⌘, intent returns with
  first-class key handling (M5/keybindings).
- **External-change tick is payload-scoped (T6):** onExternalReconcile carries the changed
  PageID set; the editor reloads only when ITS page changed. Our own conflict-copy writes
  are self-suppressed (vault-level expected-write tokens) and indexed meta-only immediately
  (parsing them would clobber the original page's index rows — same frontmatter id).

## 2026-07-09 — M1 COMPLETE — S1 gate green

All 6 tasks done through the pipeline. **S1 measured on the real app with a real
10k-block vault (200×50, sandbox container): warm cold-open first-present 827–850 ms
across 3 runs — passes the ≤ 1.5 s gate with ~45% headroom.** Full-DB-rebuild path is
~10 s (explicitly ungated per PRD §16; needs the progress UI before v1 — parked).
291 tests / 45 suites. The app launches, opens/creates sandboxed vaults, renders
read-only outlines with fold/zoom/breadcrumb, sidebar with namespaces/filter/recents,
⌘D daily notes, registry-driven menus.

Measurement notes: `-vaultPath` launch arg (container-dir fixture) + stdout `[S1]`
markers; first-present driven in-process through the real render pipeline (snapshot →
flatten → attributed-build of first 60 rows) because scripted launches don't reliably
lay out the NavigationSplitView detail pane; the AppKit host logs the same marker
idempotently when a real window lays out.

## 2026-07-09 — M1 build decisions (T1–T3)

- **xcodegen** (brew, dev tool, not a runtime dep): `project.yml` is the source of truth;
  `Outliner.xcodeproj` is gitignored and regenerated (locally and in CI).
- **New SPM targets:** `OutlineEditor` (AppKit layer, headless build-checked) and
  `OutlinerCore` (pure app logic — vault registry, navigation history, sidebar tree,
  recent pages — headless-tested). App target `Outliner` is xcodegen-managed.
- **Adopt-in-place (PRD §5.1) deferred** — needs a `Vault.pagesDir` parameter; parked.
- **`Vault.deletePage` added** (sidebar Delete): trash-then-index order (half-failures
  self-heal at cold open), purges routing/undo/fold-state, evicts.
- T3 review caught 3 blocking editor bugs pre-commit (measure/layout width drift,
  missing resize invalidation, O(total) collapsed-subtree walk in the flattener).

## 2026-07-09 — M0 COMPLETE — gate green

All 8 tasks done through the design→code→review→fix pipeline (Opus agents, Fable
coordinating). Gate: 223 tests / 36 suites green, zero build warnings — RoundTripTests
(S4, byte-level), InlineParserTests, OrderingTests, CommandTests, IndexTests (incl. S5
perf on the 10k fixture), VaultTests (28, end-to-end incl. D9 conflicts). CI runs on
first push (no remote configured yet).

M0-T8 notes: vault-wide undo routes to per-page CommandStores (history-holding pages are
un-evictable — undo is session-scoped per PRD); fold undo re-syncs the D4 sidecar;
`architecture.md`'s "re-parses inline marks on apply" is realised as refs re-derivation
from marks at reindex — under D20, delimiters never enter the model, so marks arrive via
`setMark`/autocomplete (editor, M2/M3), not model-side text parsing.

## 2026-07-09 — M0-T5 format clarifications (ratified into D1's spirit)

- **Blank lines between blocks are preserved** (anchored to the following block in layout
  memory) — format.md's grammar didn't mention them; dropping them would break S4 for any
  human-formatted file.
- **Frontmatter-less files are NOT rewritten on open**: frontmatter is optional in the
  grammar; the page id persists via the index and the `id:` line is added on first save
  (D11's literal wording). Avoids mass-rewriting adopted Obsidian vaults.
- **Non-sequential numbered markers** and **colonless frontmatter lines** count as one-time
  normalizations (flagged, rewritten on first write, fixed-point after).
- Byte-stability tests compare UTF-8 bytes, not Swift String equality (String == is
  Unicode-canonical-equivalence-insensitive — caught in review; NFD fixture added).

## 2026-07-09 — Page-identity model (reconciles D11 with tag/wikilink materialization)

Real pages keep independently-minted frontmatter ULIDs (D11 — rename stability).
Deterministic name-derived ids (NFC+lowercase → SHA-256 → Crockford) exist ONLY for
placeholder pages (tags, unresolved wikilinks; `file_path = ''`). Ref resolution prefers
a real page matching the normalized name; `replacePage`/`upsertPageMeta` reconcile: refs
pointing at a same-name placeholder are migrated to the real id and the placeholder row
is deleted, in the same transaction. Found by the T6 review (split-identity backlinks).

## 2026-07-09 — M0-T7 implementation notes (not decision changes)

- `Diff.caretHint` is a `CaretHint` struct, not the skeleton's tuple (Equatable need).
- Outdent uses Bike semantics: following former siblings stay with the old parent (D-T7-a).
- Merge target resolves to the previous sibling's deepest last descendant, else parent (D-T7-b).
- Split type inheritance: heading → bullet, task(x) → task(false), others inherit.
- Undo stores lossless internal UndoStep pairs (redo restores exact ids/orders, never re-mints).

## 2026-07-09 — M0-T3 implementation notes (not decision changes)

- **Canonical text offset unit = Unicode scalars**, model-wide: `MarkRange.lo/hi`,
  `Command` ranges, and DB `refs.range_lo/hi` all use scalar offsets. The editor
  (UTF-16 world) converts at the Command/Diff boundary — the model never sees UTF-16.
- `InlineText.marks` is `private(set)` (skeleton showed `var`): marks must stay
  normalized (sorted, coalesced, code-swallowed, clamped); all mutation goes through
  `init`/`replacingSubrange`/`togglingMark`.
- Code-mark swallow semantics: inclusive containment (a mark co-extensive with a code
  range is dropped), not strictly-inside.
- `OutlineTree` invariant policy: `precondition` crashes on command-path violations;
  the `init(page:blocks:)` disk path REPAIRS deterministically (orphans→root, cycles
  broken at lexicographically-smallest id, duplicate sibling orders de-collided).

## 2026-07-09 — M0-T2 implementation notes (not decision changes)

- `ULID`/`Fractional` gain explicit `Sendable` conformance (additive; required by the
  Vault actor boundary under Swift 6 strict concurrency).
- `Fractional` back-append key length is **linear with a small constant** (~1 char per
  31 appends), not O(log n): true O(log) needs a magnitude-header key scheme that
  violates the no-trailing-'0' storage invariant. Accepted (option A) because `ord`
  keys are regenerated on every full page reparse, so length never accumulates across
  sessions; a 1 000-block sequential page reaches ~32-char keys, which is fine.
  `between` on an open ceiling emits loDigit+1 (not midpoint) to slow growth 6×.

## 2026-07-09 — D22 ADOPTED: query blocks promoted from non-goals into v1

Jan: "super high value". Scope per Claude's recommendation **except** results are
editable in v1 (text edits, inline marks, task toggles route through the normal Command
path to the source block — same mechanism as backlinks-pane editing, D16); structural
ops on result rows stay disabled (navigate to source) and go to the parking lot along
with grammar extensions. Frozen v1 grammar: `tag:` `link:` `task:` `prop:` `text:` +
and/or/not/parens, compiling to SQL over the existing index. New phase
`Docs/phases/M3.5-query-blocks.md`; M5 gains derived-row task T5b. Also created
`Docs/parking-lot.md` (deferred-with-intent ideas ledger) — we had none before.

## 2026-07-09 — Restructure: specs extracted from CLAUDE.md

CLAUDE.md now holds only code conventions and agent behaviors (Fable coordinator, Opus
subagents, design→code→review→fix pipeline, delegation by default). The specs moved to
`Docs/specs/` (overview, decisions, architecture, format, database, model-types, editor,
testing) and the milestone plan became per-phase files in `Docs/phases/M0…M6`. Older
entries below reference CLAUDE.md section numbers (§2, §4, §6…) — those sections now live
in the corresponding `Docs/specs/` files. No decision content changed in the move.

## 2026-07-09 — D14–D21 (UI architecture) ADOPTED

Jan approved all eight UI-architecture recommendations as presented. Folded into CLAUDE.md
§2 (table rows D14–D21), §5 (new files: `Theme.swift`, `AutocompletePopover.swift`,
`WindowModel.swift`, `VaultController.swift`, `CommandRegistry.swift`), and §8 (Fallback A
is an NSTableView-backed flat row list):

- **D14** Fallback A container: view-based `NSTableView`, manual row heights, virtualized.
- **D15** Indentation: flat row list + depth inset; never nested view hierarchies.
- **D16** SwiftUI owns all chrome; AppKit only for editor surfaces via one reusable
  `EditorHost` (also embedded by the backlinks pane for in-place editing).
- **D17** `@Observable` per-window `WindowModel` + shared `VaultController`; the editor
  bypasses view models and talks Snapshot/Diff directly.
- **D18** Declarative `CommandRegistry` generates both NSMenu and palette command mode.
- **D19** Autocomplete = borderless child `NSWindow` at the caret; suppressed during IME.
- **D20** Marks parse-as-you-type with delimiter consumption (Bike-style).
- **D21** Semantic `Theme` tokens in `OutlineEditor`, bridged to SwiftUI; theme generation
  counter invalidates the M5 framesetter cache.

## 2026-07-09 — D1–D13 ADOPTED

Jan signed off on all thirteen recommendations with no changes. Folded into CLAUDE.md:
D1–D5 → §2 table + §4.2 grammar/rules; D6 → §2 + §6 schema (`pages` gains
`file_mtime/file_size/content_hash`) + §7 (`OutlineTree` is per-page); D7 → §6 FTS
(`trigram`); D10 → §9 (swift-markdown removed); D4 also adds `viewstate.json` to §4.1
and `ViewState.swift` to §5; D5 adds `Mark.image` to §7. D8, D9, D11, D12, D13 → §2 table.

## 2026-07-08 — PRD review: 13 gaps/ambiguities flagged, pending sign-off

Writing `Docs/prd.html` surfaced the following under-specifications in the build contract.
Full detail and recommendations in [Docs/prd.html §22](Docs/prd.html). None change a locked
decision's *direction*; they fill holes the locked spec leaves open. Status: **awaiting Jan's
sign-off** — nothing here is adopted yet.

Blocking M0 (format/type gaps — must resolve before the model spine is built):

- **D1** Grammar has no multi-line blocks, but Shift-Return is in the keyboard model; property
  lines vs continuation lines collide. Rec: maximal drawer run + continuation lines + `\::` escape.
- **D2** `RowType.numbered` has no serialization. Rec: emit `1. ` markers, renumber on write.
- **D3** `RowType.plain` has no serialization. Rec: `type:: plain` property (or drop from v1).
- **D4** `collapsed` is in the Block/DB but not the grammar. Rec: view-state sidecar
  (`.outliner/viewstate.json`), NOT a `collapsed::` property — folding must not dirty files.
- **D5** §4.3 rewrites images into block text but `Mark` has no image case. Rec: add
  `case image(path:alt:)` + `![alt](path)` inline grammar.

Decide before M3:

- **D7** FTS5 `unicode61` cannot substring-match Japanese. Rec: `trigram` tokenizer.

Recommendation-only (will proceed on the rec unless objected):

- **D6** Resolve §7's explicit TBD: per-page trees + LRU; add `file_mtime/file_size/content_hash`
  to `pages` for incremental cold-open (edits locked schema §6).
- **D8** Tag charset is ASCII-only; author writes Japanese tags. Rec: Unicode letters/digits.
- **D9** File-watch reconciliation has no policy. Rec: clean→silent reload; dirty→app wins,
  external copy becomes a `(conflict …)` file.
- **D10** Rec: drop `swift-markdown` — the grammar is line-oriented; hand-rolled reader/writer is
  smaller and byte-stability is easier to guarantee. (Challenges §9 dependency table.)
- **D11** Rec: persist page ULID as frontmatter `id:` so Finder renames don't orphan identity.
- **D12** `daily/` appears in the vault layout but the feature is unspec'd. Rec: minimal ⌘D
  open-or-create `daily/YYYY-MM-DD.md` in M1.
- **D13** Rec: App Sandbox on from M1 with security-scoped bookmarks.

On sign-off: fold D1–D5 into CLAUDE.md §4/§7, D6 into §6/§7, the rest into §2 as new locked rows,
and date-stamp the adoption here.

---

## 2026-08-05 — Web-archiving follow-up (from in-app review)

- **WA-D3 REVISITED (was "defer mid-line glyph collision"):** the snapshot glyph is now an
  INLINE per-web-link icon rendered as a display CHIP — a transparent `NSTextAttachment` with a
  `CTRunDelegate` for real advance, produced by `SnapshotGlyphSubstitution` through the existing
  `ChipReplacement`/`DisplaySubstitutionMap` pipeline (the same mechanism blockref/attachment
  chips use). This REPLACES two failed attempts: a per-row gutter indicator (rejected — collided
  with the block handle) and a `.kern`-slot approach (drew the icon ~17px over the preceding word
  because the reserved slot didn't survive the dimmed/hidden reveal + substitution pipeline; it
  passed unit tests but was visibly broken). Every http(s) web link shows a globe (base) that
  swaps to archivebox / spinner / failed by snapshot state; drawn only on the unfocused render.
  Verified in the running app. (`94ffe5f`; supersedes `d33e051`/`060cc45`/`ae13791`.)
  Lesson: for editor-render features, in-app screenshot verification is the gate — green unit
  tests hid a fully-broken render twice.
- **Orphaned-snapshot cleanup — OPT-IN user-confirmed delete, NOT automatic GC:** when a
  snapshot's source URL becomes fully unreferenced across the vault, a non-blocking banner offers
  a Trash-only [Delete] (reusing the TOCTOU-guarded Audit-Assets deletion path). This reopens the
  "no automatic asset GC" non-goal (parking-lot.md) but stays consistent with it — nothing is
  removed without an explicit click, files go to Trash (recoverable), and Audit Assets remains the
  manual batch net. Detection is debounced off the reindex, undo-safe, dedup-aware, and the
  baseline is seeded at vault open so the common flow (open → remove a link) actually fires.
  (`bc3426f`)

## 2026-08-05 — D30: folder-agnostic wikilink resolution (amends D8's link-identity)

- **D30 — a page's LINK-IDENTITY is its basename, not its folder path (adopt the Obsidian model).**
  Wikilink resolution was a straight equality on `normalized_name`, which is the FULL vault-relative
  path (`Core Concepts/Your Files Are Yours`). So `[[Your Files Are Yours]]` could not resolve a page
  in a subfolder, and moving a page between folders changed its `name` and broke every inbound link —
  an incoherent hybrid (real folders like Obsidian, but path-identity like a Logseq namespace, with the
  downsides of both). Enliner's "real Markdown in real folders" ethos (S7) fits Obsidian's model:
  **identity = basename, folders are pure organization, disambiguate by shortest path only when needed.**
- **What changes.** Resolution (`Queries.pageID(forName:)` / `realPageIDs(forNames:)`) becomes a ladder:
  (1) exact `normalized_name` [backward-compatible], (2) unique `normalized_basename` for a no-slash
  target [the fix], (3) unique path-SUFFIX for a slash target [`[[2021/Books]]` disambiguation], (4)
  ambiguous → deterministic winner (shallowest path, then lowest ULID), (5) unresolved. A new indexed
  `normalized_basename` column on `pages` backs step 2 (populated where `normalized_name` is, via a new
  `PageIdentity.basename(of:)`); added by a schema-version-bump migration repopulated on the rebuildable
  index's cold-open reparse (no backfill logic).
- **How D8 is amended (NOT reopened wholesale).** D8's NFC + case-insensitive *normalization* rule is
  unchanged. D8's "page names are case-insensitively **unique**" now means: the **full path** remains the
  on-disk uniqueness key (filesystem-guaranteed); **basenames MAY collide** across folders, and the
  resolution ladder above is the disambiguation contract (an author qualifies with a path to override the
  deterministic winner). The `specs/decisions.md` D8 row should be read together with this entry.
- **Consequences.** Moving a page between folders no longer breaks inbound links (identity = basename,
  unchanged) — this halves the separately-backlogged "update links on rename/move" job (move becomes a
  non-event; only a true rename rewrites links). The bundled manual works with its folder tree intact and
  its bare-leaf links as-authored, so converter A only reformats content — no link rewriting/flattening.
  Read-side/index-only: no `.md` bytes change; `open → save` byte-stability (D20) is untouched. A
  proximity-to-linker disambiguation (Obsidian's "nearest") is a documented future refinement over the v1
  deterministic winner. PRD: `Docs/prds/backlog/wikilink-resolution.md`.

## 2026-08-09 — PR-D8 status: editor port LANDED, pure-SwiftUI sidebar GATED OFF (crashes)

- **The AppKit→SwiftUI EDITOR port is DONE and stable.** The editor no longer hosts an
  AppKit `OutlineView` for input/display: it is a pure-SwiftUI `OutlineCanvas` (a viewport-
  pinned `Canvas` overlay over a `ScrollView`) driving the headless engine, with the ONE
  irreducible AppKit seam being `TextInputProxyView: NSView, NSTextInputClient` (IME). An
  intermittent `inputContext` SIGSEGV in that proxy — a Swift-6.3/macOS-26 executor-check
  segfault (`swift_task_isCurrentExecutorImpl`) when AppKit called the `@MainActor @objc`
  getter from a CFRunLoop-observer context — was fixed by making the override `nonisolated`
  reading only `nonisolated(unsafe)` storage (`3a1a976`; verified 5×55s idle cycles, 0 crashes).
  This is the shippable config: **pure-SwiftUI editor + the existing NSOutlineView sidebar
  (flag OFF)** — confirmed stable through cold-open of the 435MB LNVLT vault.
- **The pure-SwiftUI SIDEBAR (PR-D8 phases 1–5) is built but stays GATED OFF**
  (`@AppStorage("sidebar.pureSwiftUI")`, default `false`). It renders and single-click works,
  but two flaky macOS-26 crash families appear ONLY when the flag is ON (flag-OFF is stable):
  1. **Multi-select `_NSViewLayout` EXC_BREAKPOINT.** A ⇧-range select that flips many rows'
     selection at once made `List`/NSTableView relayout the whole per-row *background-subview*
     set in one batched pass and throw an uncatchable ObjC exception (`+[NSApplication
     _crashOnException:]`). Two structural attempts (single stable `.listRowBackground` view
     type; then moving the fill OFF `.listRowBackground` into the row's own `.background`,
     `4e70fbc`) did not verifiably clear it.
  2. **`OutlineCanvas` executor SIGSEGV on flag-ON cold-open.** With the SwiftUI sidebar in
     the window tree, the editor's `Canvas` draw closure hits a `swift_task_isCurrentExecutor`
     segfault during `NSHostingView.layout()` → `CanvasDisplayList.updateValue()` — a stale
     `@MainActor` `model` isolation check, the SAME executor-check family as the inputContext
     fix. Pre-existing on the branch, flag-ON-timing-triggered, flaky.
- **Decision: do NOT flip the default and do NOT delete `SidebarOutlineView.swift` (Phase 6)
  until both are resolved and live-verified.** Shipping a crashing sidebar default is worse
  than an unfinished port. The editor port — the large majority of the AppKit surface — is
  finished; the sidebar port is preserved behind the flag as WIP.
- **Path to finish PR-D8** (future session): (a) reproduce #2 deterministically and treat the
  `@MainActor model` access inside the `Canvas` draw closure the way the inputContext fix
  treated the proxy — the isolation check must not run against a possibly-torn-down actor
  during a display-list update; (b) with cold-open stable, re-run the multi-select verify to
  confirm #1's `.background` fix; (c) then Phase 6 (flip default, move `SidebarPageMenu`/
  `SidebarFolderMenu` out of `SidebarOutlineView.swift`, delete it + the dead
  `selectionForExternalNav`/`navigationForAppKitSelection` helpers). The pure reducer
  (`SidebarSelection.click`, 25 tests) and flatten (`SidebarFlatten`, 16 tests) are green and
  selection-independent-of-rendered-rows by construction — the crash is purely in `List`/
  NSTableView + the editor's Canvas display-list, not the model.

### Same session (carried on this branch): macOS 26 target, markdown escapes, startup Phase D
- **Deployment target is macOS 26 everywhere on this branch** (`project.yml` global
  `deploymentTarget.macOS = "26.0"`); main still says 14 and is corrected by landing this branch.
- **Markdown inline-escape sets consolidated** (`346411f`): the three drifted escape tables
  (recognition vs emit vs query-body) unified onto `Scalars.escapable` (recognition) +
  `Scalars.needsBackslash` (emit) as the single canonical source, fixing the `=`/`$` drift.
- **Startup Phase D — deferred cold version-heal** (`d077c63`): `Vault.init` no longer
  force-reparses every file synchronously on a version bump of an already-populated
  source-canonical (v≥4) index — it stamps the version, sets a persisted `pending_version_heal`
  marker, and defers the full reparse to a token-guarded post-paint Task (the coldOpenProgress
  banner covers it). Reads stay correct throughout (page content always parses fresh from disk;
  the heal only realigns derived index data). 6 new deferral tests; OutlineModel target 963/963.
