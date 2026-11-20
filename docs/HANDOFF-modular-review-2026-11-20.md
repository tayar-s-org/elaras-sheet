# Handoff / PRD — Modular review fixes (2026-11-20)

Branch: `fix/modular-review-2026-11-20` (from `main` at `080aeae`).
Source: `revisao-modular-2026-11-20.md` (37 findings + maintenance list).
Size: 195 files, +6266 / −2421, 13 commits (7 implementation, 6 review-adjustment).

## 1. Goal and result

Fix the 37 findings of the modular review, keeping the code SOLID and semantic (single-purpose hooks/functions, intent-revealing names, comments only for real constraints), then review every fix and adjust the review findings.

| Check | Result |
|---|---|
| `npm test` | 499 / 499 pass (baseline 338). Also run on a clean copy of the committed files. |
| `npm run build` | Passes. Main chunk **1,195 kB → 683 kB** (gzip 352 → 203 kB). Rooms chunk 323 kB, DiceStage 536 kB (unchanged, already split). |
| Migrations 0046–0051 | **Applied to the live Supabase** (answer "1.C"), no errors. |
| Live DB tests (throwaway accounts, deleted afterwards) | `concurrencyDbTest` 18/18, `itemsDbTest` 104/104, `masterHubDbTest` 331/331, new `reviewFixesDbTest` 98/98. Run with `node --experimental-websocket scripts/<name>.mjs` on Node 20. |
| Code review | 6 independent reviews (one per implementation commit); every verified finding fixed or explicitly deferred (section 6). |
| Not verified | Nothing was exercised in a browser (desktop/mobile/keyboard). See the manual QA list in section 8. |

## 2. Decisions and assumptions

1. **Estudo Mágico (#8):** the owner did not know the campaign rule. Assumption: no cap on accumulated Astúcia dice; each attempt still costs 16 and one die is earned every 25 study hours. Change it in `src/rpg/activities.js` (`astuciaDiceFor`) and migration `0048` if the rule differs.
2. **Trust model (#27, option A):** the character sheet is intentionally free. The owner can write any value in `characters.data` (money, XP, inventory). No authoritative server fields were added. Documented in `supabase/migrations/README.md` ("Modelo de confiança da ficha"); the false guarantee in the `0039` header was reworded.
3. **Migrations applied live:** `0046`, `0047`, `0048`, `0049`, `0050`, `0051`. `0018` was **not** re-run: the published database already has `table_custom_items`.
4. **Live DB lacks `0032_custom_skill_attribute.sql`.** `0047` was written to work with or without it (`to_jsonb(s) ->> 'attribute'`). Other unapplied older migrations were not audited; use the marker query in the migrations README.
5. **Docs folder:** `/docs/` was in `.gitignore`; that line was removed so this document is versioned.
6. **Tooling:** the machine had no `npm`; npm 10.9.2 and the npm cache live in `/media/theo/HDD/elaras-work-tmp` (outside the repo). `scripts/db.mjs` had an argument bug (file path was dropped when `--query` was absent); fixed.

## 3. The 37 findings

| # | Pri | Fix | Main files |
|---|---|---|---|
| 1 | P1 | Sign-out waits (≤10 s) for pending saves; unsaved/conflicting sheets go to a per-account draft vault and return on next login; local archetypes are no longer wiped on logout. | `src/app/useAccountSession.js`, `accountDrafts.js`, `useAutosave.js` |
| 2 | P1 | Two-phase benefit delivery: `peek_pending_benefits` (no marking) → apply to sheet with an applied-ID ledger → autosave → `confirm_benefits` (idempotent). Old `claim_*` RPCs untouched. | `0047`, `src/features/library/deliverBenefits.js`, `src/rpg/benefitLedger.js` |
| 3 | P2 | One claim cycle per user (shared lists read once, paused while tab hidden, stops on network/session errors). | `useBenefitClaims.js`, `claimCycle.js`, `cycleRunner.js`, `useCycleEffect.js` |
| 4 | P2 | Save status per sheet plus an aggregate "other sheets pending" line. | `useAutosave.js`, `saveStatus.js`, `CloudSheets.jsx` |
| 5 | P2 | Table picker separates error from empty and offers retry. | `TableBinding.jsx` |
| 6 | P2 | Search ignores stale responses (query gate) and clears old errors. | `TablesPage.jsx`, `src/lib/queryGate.js` |
| 7 | P2 | Dirty archetype draft survives sub-tab/sheet switches and asks before discarding on Escape/backdrop/close. | `src/useArchetypeDraft.js`, `CustomArchetype.jsx`, `SheetModules.jsx` |
| 8 | P1 | Dice cap removed (assumption above). JS + SQL + tests. | `src/rpg/*`, `0048` |
| 9 | P2 | Purchase rejected before debit at 99; button disabled with the reason. | `src/market/inventory.js`, `MarketTab.jsx` |
| 10 | P2 | Rebase accepts the cloud value when local did not change the field; by position for equal lengths, by level identity only when the cloud has fewer units. | `src/sheetRebase.js` |
| 11 | P2 | Tabs restored one by one; rejected ones kept in `manrakora-sheets-rejected` and reported; session not overwritten when keeping them failed. | `src/sheets.js`, `useSheetSession.js` |
| 12 | P2 | Meditation history closes the old session before opening the new one on day change. | `src/rpg/history.js` |
| 13 | P1 | Room reconciles messages/rolls/log/states/members on every (re)subscribe, with stale-response guards. | `useRoom.js`, `liveBuffer.js`, `snapshotGuard.js` |
| 14 | P2 | Board reloads tokens/marks on re-subscribe even with the same map. | `useBoard.js` |
| 15 | P2 | Resource edits roll back/reconcile on failure; error shown; no false "faint" success message. | `PartyPanel.jsx` |
| 16 | P2 | Soundpad operations invalidated per mount/sound; stop always reaches playing audio. | `useSoundpad.js`, `src/operationGuard.js` |
| 17 | P2 | One shared live-character source, de-duplicated, paused while hidden; fetches only changed sheets (by revision). | `useLiveCharacters.js`, `polling.js`, `src/lib/characterRefresh.js` |
| 18 | P2 | Signed URLs cached with expiry and renewed; playback errors shown (also to players). | `src/lib/signedUrlCache.js`, `MusicPlayer.jsx`, `SoundBar.jsx` |
| 19 | P2 | Chat, rolls and log buffers capped at 200; log no longer sorts the whole history. | `liveBuffer.js`, `tableLogEntries.js` |
| 20 | P2 | Master conditions applied as deltas under row lock. | `0046` (`gm_conditions_delta`), `ConditionsModule.jsx` |
| 21 | P2 | Empty/invalid amount can no longer become "set to 0". | `AdjustForm.jsx`, `parseWholeNumber` |
| 22 | P2 | Table/clock queries bound to table identity; stale responses dropped. | `extras.jsx`, `useClock.js` |
| 23 | P2 | Aptitude bound to `(tableId, cloudId)`; invalid selection falls back. | `SheetAptitude.jsx`, `pickTable.js` |
| 24 | P2 | Keyboard positioning (X/Y sliders + hint) in the token editor. | `TokenFramingControls.jsx` |
| 25 | P1 | `0018_custom_items.sql` rebuilt from the live schema (table, policies, triggers, `claim_custom_items`). Header says to diff it against production. | `0018` |
| 26 | P1 | `state` must be a JSON object; trigger refuses anything else, so GM conditions can no longer be wiped with `[]` then `{}`. | `0046` |
| 27 | P1c | Trust model documented (option A). | README, `0039` header |
| 28 | P2 | Approval debits the sheet balance in the same transaction (lock sheet then request). | `0050` |
| 29 | P2 | Approve/revoke are single-shot transitions; no double charge/refund. | `0050` |
| 30 | P2 | Player limit serialized with a table-row lock in join and approve. | `0051` |
| 31 | P2 | Music replace: upload → persist reference → delete old; new upload removed on failure. | `src/lib/replaceStoredFile.js`, `music.js` |
| 32 | P2 | Per-field resource RPCs under row lock (same authorization as before). | `0049`, `src/lib/room.js` |
| 33 | P2 | Book page no longer steals focus; opens in the shared modal (focus trap/restore). | `Assistant.jsx`, `PageViewer.jsx`, `Modal.jsx` |
| 34 | P2 | Assistant panel is a 3-area grid; question list no longer under the footer. | `assistant.css` |
| 35 | P2 | Panel clamped to the viewport (pure function, compact mode). | `panelGeometry.js` |
| 36 | P2 | Routes and editor tabs lazy-loaded with fallbacks and an error boundary. | `src/app/AppRoutes.jsx`, `ErrorBoundary.jsx` |
| 37 | P3 | Book index normalized once; query normalized once; results memoized. | `src/bookSearch.js`, `Book.jsx` |

## 4. Maintenance items (owner allowed refactors)

Done: `App.jsx` split (317 → ~85 lines into `src/app/*`); `BoardView.jsx` split (gestures / token operations / step move / viewport math); `TokenMaker.jsx` split (image load / payload / render / UI); `validateCharacter` normalizers and `processHour` handlers per activity (golden test against the old output); `Assistant.jsx` and `engine.js` split; shop icons moved to `src/market/experienceIcons.js` (domain no longer imports a screen); async claim infrastructure unified; no-op `isGm ? rows : rows` and unused `IdentityTab` props removed; wrong comments fixed; chat auto-scroll only near the end with a "new messages" button; `powerDamage.test.js` and all new tests are in the `test` script; `pdf.js` prints `d12+N`; rollbacks moved to `supabase/migrations/rollbacks/`; error classification (not installed / unavailable / session expired / denied) in `src/lib/backendError.js`, `requests.js`, `customItems.js` and the book loader.

Not done (deliberately): legacy `server/index.js` split (review said lower priority); an applied-migrations registry table (a read-only marker query is documented instead); "measure TokenMaker canvas redraws" (needs a profiler); numbering of repeated migration numbers (documented, not renamed because there is no control table).

## 5. Deploy checklist

1. Migrations `0046–0051` are already applied. New app code **requires** `0046`, `0047`, `0049` (condition RPC, benefit peek/confirm, resource RPCs). Do not publish the old app and new DB mixed longer than needed: the old app keeps working with the new DB (additive functions; old `claim_*` kept).
2. Open the PR, merge, let GitHub Pages deploy (`gh run watch` if available elsewhere).
3. Already-open tabs need a reload after deploy (the new error boundary shows "Recarregar" on stale chunks).
4. Optionally run the four DB test scripts again after deploy.

## 6. Code review outcome

Every implementation commit was reviewed by an independent agent and adjusted. Notable catches: overlay painted under chat log (#34); help text still saying "max 24"; wrong unit matching for repeated canteen levels (also caught by the live DB test); old rolls replaying after reconnect; stale signed URL written back after `forget`; XP lost when a claim cycle was cancelled after the server marked it claimed; app going blank on stale lazy chunks; `0047` depending on migration 0032 (not applied live); `confirm_benefits` accepting pending skills.

Deferred review notes (low risk): initial `resync` still runs a light member/board refresh on the first subscribe; `replaceStoredFile` deletes the new file if persisting fails ambiguously (timeout after server applied); the benefit ledger keeps the newest 100 IDs; `SheetWorkspace` state resets when leaving `/fichas`; hook wiring (not only pure helpers) lacks tests.

## 7. Known limitations and follow-ups

- **GM direct update:** the `custom_items_update` policy still lets the GM change `status`/`price` through the REST API, bypassing the debit/refund done by the approve/revoke RPCs. Fits the trust model, but a trigger could freeze those columns.
- **XP/money queue** (`claim_xp`/`claim_money`) is still consume-then-apply (now never dropped client-side, but not transactional).
- **"Load older messages"** (#19) was not built: the data layer has no "before id" cursor; buffers are only capped.
- **Rejected tabs** are stored but there is no recovery screen yet.
- `0018` is a reconstruction; diff it against production before using it to build a new database.
- Migrations `0033–0038` live status was not audited (only `0032` is known missing).

## 8. Manual QA (not done here)

Desktop + phone + keyboard: logout right after editing; two accounts on one browser; open archetype editor, switch sub-tabs, close with Escape; assistant list/footer overlap and short windows (800×400); book page modal focus; token X/Y by keyboard; chat "new messages" button; reconnect (offline/online) in a room with two players; soundpad stop during load; two tabs adding master conditions; approving two items with insufficient balance; buying at 99 units; magic study second attempt.
