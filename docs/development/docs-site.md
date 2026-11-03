# Docs site

This site is built from the Markdown in the repository. Edit the files in `docs/`, `README.md` or `CONTRIBUTING.md`; never the generated pages.

## How it works

- `docs-site/` is an [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) project.
- `docs-site/scripts/sync-docs.mjs` copies each page listed in its `PAGES` table to a site route before every build. It takes the title from the first `# heading`, turns GitHub alerts (`> [!NOTE]`) into asides, and rewrites relative links: a link to another published page becomes a site link, anything else becomes a GitHub link.
- The build fails on a broken internal link or anchor (`starlight-links-validator`).
- The **Docs site** workflow builds the site on pull requests that touch the docs and deploys it to GitHub Pages from `main`.

## Preview it

```bash
cd docs-site
npm ci
npm run dev
```

The site runs at http://localhost:4321/schist/. `npm run build` builds it and checks the links.

## Add a page

1. Write it in the right folder of `docs/`: `getting-started`, `guides`, `reference`, `self-hosting` or `development`. Start with a `# Title` and one sentence that says what the page is for.
2. Add it to `PAGES` in `docs-site/scripts/sync-docs.mjs`, and to the sidebar in `docs-site/astro.config.mjs`.
3. Link to other pages by their file (`[Backups](../self-hosting/backups.md)`), so the link works on GitHub and on the site.

When you rename or move a page, add a redirect from the old route in `astro.config.mjs`.

## Style

- Short sentences, plain words, no marketing.
- Tables for options and settings; fenced, copyable commands.
- Write for the reader of the page: what to do, then why.
- Examples use `wiki.example.com`, never a real host.
