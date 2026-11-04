# Two-way GitHub sync (smaller version): design

Issue: #303. Status: approved design, not built yet.

## Goal

Pages edited outside Schist, mainly in Obsidian through a clone of the backup
repository, come back into the wiki. Schist is used by one person or a handful,
who usually alternate between Schist and Obsidian rather than editing the same
page in both within minutes. The design covers that pattern and keeps the rest
simple:

- Changes on different pages merge automatically.
- The same page changed on both sides pauses the sync until someone picks a
  side for it. There is no line-by-line merge and no conflict copies.
- A save from an editor whose page changed underneath it is refused, so a pull
  (or another user) is never overwritten silently.

Out of scope here: reading notes that Obsidian creates as they are (file names
with spaces, no front matter). Schist can't read those yet. That is a separate
piece of work, done later and only if it's needed. Until then, Obsidian is used
to edit pages that Schist created.

## Mode

- A new GitHub setting, `mode`: `backup` (the default) or `two-way`.
- **`backup`** is today's behavior: push only. A remote that has moved on gives
  `SYNC_REMOTE_DIVERGED`, and "replace remote" is the way out.
- **`two-way`** pulls on every sync.
- Settings → GitHub offers "Backup only" and "Two-way sync". Existing setups
  stay on backup.
- Switching to two-way shows a preview first (see "Switching on"). Switching
  back only stops pulling.
- In two-way mode a sync also runs when nothing changed locally, so remote
  edits arrive. The default interval drops from 15 to 5 minutes;
  `SCHIST_GITHUB_AUTO_SYNC_MINUTES` still overrides it.

## One sync (two-way)

The triggers are unchanged: shortly after a save, on the interval, and "Sync
now". Syncs are serialized, as today.

1. Commit pending local changes (as today).
2. Fetch the configured branch.
3. Compare the local HEAD with the remote head:
   - **The remote is part of local history:** push if needed (today's path).
   - **Local is part of the remote's history:** fast-forward to the remote
     head.
   - **Both moved:** classify every file that differs between the merge base,
     the local HEAD and the remote head, using the rules below.
4. **No conflicts:**
   - Build the merged tree in memory.
   - Apply it under the document write lock: check that HEAD hasn't moved
     (if it has, go back to step 3), write and delete the files, commit a merge
     commit with both heads as parents, and mark the touched paths stale for
     the link and search indexes.
   - Push. If the remote moved again, go back to step 2, up to 3 times. After
     that, the sync fails with a retryable error and the next sync tries again.
5. **Any conflict:** apply nothing and push nothing. Record the sync as paused
   (see "Paused sync").

### Classifying a file (base B, local L, remote R)

| Case | Result |
|---|---|
| L = B, R ≠ B | take R (including a deletion) |
| R = B, L ≠ B | keep L |
| L = R | keep (both made the same change) |
| page: L ≠ B, R ≠ B, L ≠ R | **conflict**, including an edit on one side and a deletion on the other |
| other files (`.obsidian/`, attachments, anything that isn't a page) changed on both sides | take R |

- Files are compared by git blob hash. A change in line endings only counts as
  a change.
- Files that aren't pages are carried through the merge unchanged, written to
  disk and committed. They never show up as pages, and `.obsidian/` joins the
  ignore list.
- **A `.md` file Schist can't read** (no front matter, or a file name that
  isn't a valid path, as with a note created in Obsidian) is treated like any
  other file that isn't a page: it is carried along and committed, but not
  shown. The sync status lists such files as "not readable by Schist", so they
  don't vanish without a word.
- **No shared history** (the repository was made elsewhere, or after a
  replace): the base is the empty tree. A file only on GitHub comes in, a file
  only in Schist goes out, and the same path with different content on each
  side is a conflict.

### Why there are no partial merges

A merge commit marks the remote head as merged. If conflicting pages took the
local version inside a merge commit, their remote change would be treated as
already merged and would drop out of every later comparison. So a sync with any
conflict applies nothing.

## Paused sync

- **The status** is stored with the other sync status fields:
  - `LastSyncErrorCode = SYNC_CONFLICT`
  - the remote head the conflicts were computed against
  - the list of conflicting paths

  A background sync reports it the same way as a manual one.
- **Settings → GitHub** shows "Sync paused: N pages changed in both Schist and
  GitHub" with one row per page.
- **An affected page** shows a banner linking there.
- **Each row** opens a side-by-side diff (the version-history diff view) with
  **Keep Schist's** and **Take GitHub's**. "All Schist" and "all GitHub" choose
  for every row at once.
- **The choices are sent with the remote head they were based on**
  (`POST /github/sync` with `resolutions` and `remote_head`). The sync then runs
  with those choices for the conflicting paths. If the remote head has moved,
  the conflicts are recomputed. A choice is kept only where the page's remote
  blob is unchanged; any other page asks again.
- **The version that loses** stays in git history on its side.
- **While paused,** Schist works normally. Saves commit locally, and pushing
  waits until the conflicts are resolved.

## Switching on: preview

`POST /github/sync/preview` fetches and classifies, but writes nothing. It
returns the pages that would be added, changed and deleted locally, the pages
that would go out, and the conflicts. The Settings switch shows this and asks
for confirmation before saving `mode = two-way` and running the first sync. If
there are conflicts, that first sync pauses and they are resolved as above.

## Stale-editor guard (both modes)

- **Every page read returns a `version`:** the sha256 of the file's bytes.
- **Saves take an optional `baseVersion`.** When it is present and differs from
  the file on disk, the save is refused with `409 DOCUMENT_CHANGED`, and the
  response holds the current page. Saves without `baseVersion` (MCP, the API,
  old clients) behave as today.
- **The editor sends `baseVersion` with every save,** manual and autosave, and
  takes the new `version` from each successful save.
- **On a 409** the editor stops autosaving and shows "This page changed since
  you opened it (on GitHub or by someone else)":
  - **Load the new version:** copies the editor's text to the clipboard first.
  - **Keep mine:** saves again without the check; the other version stays in
    history.
- **A save that renames the page** checks the file at the old path.

## Code shape

- **`syncplan` (pure):** `Plan(base, local, remote map[path]blob, isPage func)
  → {apply []change, conflicts []path}`. It has no git or disk access, and is
  table-tested.
- **The sync's remote is injectable:** the push and fetch URL plus auth, and
  the repository lookup (behind a small interface). Tests use a local bare
  repository as "GitHub". Production behaves as today.
- **The document write lock:** a lock held by page saves, imports and moves
  while they write, and by the sync while it applies. The sync holds it only
  for the apply step, never while it fetches or pushes.
- **`GitHubSettings`** gains `Mode` and the paused-sync fields. The settings API
  and the UI follow.

## Testing

- **`syncplan` table tests:** every row of the classification table, an
  identical change on both sides, an edit against a deletion, files that aren't
  pages, and no shared history.
- **Go integration tests on real git repositories:** a bare "GitHub" repo, the
  wiki, and a second clone standing in for Obsidian. They cover:
  - fast-forward
  - merging different pages
  - pause, resolve and resume
  - the remote moving between the pause and the resolution
  - a push race and its retry
  - the preview
  - backup mode unchanged
- **Stale-editor guard:** handler tests (match, mismatch, absent) and frontend
  tests for the dialog and for autosave stopping.
- **e2e:** the stale-editor dialog only. Open a page, change it through the
  API, type, and expect the dialog. CI can't reach GitHub; the sync is covered
  by the Go integration tests.

## Delivery

1. The stale-editor guard. It is useful on its own, for several Schist users.
2. The sync engine: `syncplan`, the injectable remote, the write lock, two-way
   mode and pause on the backend, with resolutions through the API.
3. The UI: the mode switch with preview, the paused-sync list with diff and
   resolve, the page banner, and the docs (the GitHub backup guide and the
   configuration reference).
