# First steps

A short tour after installation: sign in, write a page, link it and find it again.

## 1. Create the admin account

On the first visit Schist opens the setup page. Pick a username and register a passkey. This first account is the admin. You add more people later with [invite links](../guides/users-and-passkeys.md).

## 2. Write a page

1. Press <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>, or click **+** in the sidebar and choose **New page**.
2. Give it a title and, if you like, start from a template.
3. Write markdown and save with <kbd>Ctrl/Cmd</kbd>+<kbd>S</kbd>.

Every save is a git commit. Press <kbd>Ctrl/Cmd</kbd>+<kbd>E</kbd> to switch between reading and editing.

## 3. Link pages

Link to another page by its title:

```markdown
See [[Project ideas]] and [[Meeting notes]].
```

A link to a page that doesn't exist yet shows as a broken link; click it to create the page. Each page lists its **backlinks**, the pages that link to it. [Writing and linking](../guides/writing-and-linking.md) covers how links are resolved, tags, properties and diagrams.

## 4. Organise with folders

Pages live in folders, like files on disk. Create one with <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> or the **+** menu, and drag pages between folders in the sidebar. Links keep working when you move a page, because they point at its title.

## 5. Find things

- **Quick switcher** (<kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd>): jump to a page by title, or search the full text.
- **Tags:** add `#tags` in the text or a `tags` list in the front matter, then search with `tag:name`.

## 6. Bring your notes

Already have markdown notes or an Obsidian vault? [Import](../guides/import-and-export.md) them as a folder or a `.zip`.

## Where to go from here

| I want to… | Read |
|---|---|
| Back the wiki up to GitHub | [GitHub backup](../guides/github-backup.md) |
| Share a page with someone outside | [Sharing](../guides/sharing.md) |
| Keep API keys out of my pages | [Secrets](../guides/secrets.md) |
| Let Claude or another assistant use the wiki | [AI assistants (MCP)](../guides/ai-assistants.md) |
| Learn the keyboard shortcuts | [Keyboard shortcuts](../reference/keyboard-shortcuts.md) |
