// Generates the Starlight pages from the repo's own Markdown (docs/<section>/*.md and
// CONTRIBUTING.md). Those files stay where they are and stay the single source of truth;
// this script copies each one to a site route, takes its title from the first H1, adds
// Starlight front matter, and rewrites relative links: links to a published file become
// site routes, anything else (code, workflows, LICENSE) becomes a GitHub link.
// The output folders are gitignored. Runs before `dev` and `build`.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..'); // docs-site
const repoRoot = resolve(siteRoot, '..');
const contentDir = join(siteRoot, 'src', 'content', 'docs');

const REPO = 'https://github.com/MorrisMorrison/schist';
const BASE = (process.env.DOCS_BASE ?? '/schist').replace(/\/$/, '');

// Source file (repo-relative) → site route. `title` overrides the file's H1.
// docs/<section>/<page>.md is published at <section>/<page>; CONTRIBUTING.md joins the
// development section. Add new pages here and to the sidebar in astro.config.mjs.
const DOCS = {
	'getting-started': ['introduction', 'installation', 'first-steps'],
	guides: [
		'writing-and-linking',
		'import-and-export',
		'github-backup',
		'sharing',
		'secrets',
		'ai-assistants',
		'users-and-passkeys'
	],
	reference: ['configuration', 'rest-api', 'mcp-tools', 'error-codes', 'keyboard-shortcuts'],
	'self-hosting': ['reverse-proxy', 'backups', 'upgrading'],
	development: ['setup', 'architecture', 'testing', 'ci-and-releases', 'docs-site']
};
const PAGES = [
	...Object.entries(DOCS).flatMap(([section, pages]) =>
		pages.map((page) => ({ src: `docs/${section}/${page}.md`, route: `${section}/${page}` }))
	),
	{ src: 'CONTRIBUTING.md', route: 'development/contributing' }
];
// Generated route folders, cleared on every run (keep in sync with .gitignore).
const GENERATED = Object.keys(DOCS);

const toPosix = (p) => p.split(sep).join('/');
const routeBySrc = new Map(PAGES.map((p) => [p.src, p.route]));
const yaml = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Splits Markdown into prose and fenced-code chunks so links are only rewritten in prose.
function mapProse(md, fn) {
	const lines = md.split(/\r?\n/);
	const out = [];
	let buf = [];
	let fence = null;
	const flush = () => {
		if (buf.length) out.push(fence ? buf.join('\n') : fn(buf.join('\n')));
		buf = [];
	};
	for (const line of lines) {
		const m = line.match(/^\s*(`{3,}|~{3,})/);
		if (!fence && m) {
			flush();
			fence = m[1];
			buf.push(line);
		} else if (fence && m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) {
			buf.push(line);
			flush();
			fence = null;
		} else {
			buf.push(line);
		}
	}
	flush();
	return out.join('\n');
}

// GitHub alerts (`> [!NOTE]` blockquotes) → Starlight asides (`:::note … :::`).
const ALERTS = {
	NOTE: 'note',
	TIP: 'tip',
	IMPORTANT: 'note[Important]',
	WARNING: 'caution',
	CAUTION: 'danger'
};
function convertAlerts(prose) {
	return prose.replace(
		/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n((?:>.*(?:\n|$))*)/gm,
		(_, kind, quoted) => {
			const inner = quoted.replace(/^> ?/gm, '').replace(/\n$/, '');
			return `:::${ALERTS[kind]}\n${inner}\n:::\n`;
		}
	);
}

function transformProse(md, srcRel) {
	const fileDir = dirname(join(repoRoot, srcRel));
	return mapProse(md, (prose) =>
		convertAlerts(prose).replace(/\]\(([^)\s]+)\)/g, (full, target) => {
			if (/^(https?:|mailto:|#|\/)/i.test(target)) return full;
			const cut = target.search(/[#?]/);
			const path = cut === -1 ? target : target.slice(0, cut);
			const suffix = cut === -1 ? '' : target.slice(cut);
			if (!path) return full;

			const abs = resolve(fileDir, path);
			const rel = toPosix(relative(repoRoot, abs));
			const route = routeBySrc.get(rel);
			if (route) return `](${BASE}/${route}/${suffix})`;
			const kind = existsSync(abs) && statSync(abs).isDirectory() ? 'tree' : 'blob';
			return `](${REPO}/${kind}/main/${rel.replace(/\/$/, '')}${suffix})`;
		})
	);
}

for (const dir of GENERATED) rmSync(join(contentDir, dir), { recursive: true, force: true });

for (const page of PAGES) {
	const raw = readFileSync(join(repoRoot, page.src), 'utf8').replace(/\r\n/g, '\n');
	// The first H1 is the page title (Starlight renders it); drop it from the body.
	const h1 = raw.match(/^\s*#\s+(.+)\n+/);
	const body = h1 ? raw.slice(h1[0].length) : raw;
	const title = page.title ?? (h1 ? h1[1].trim() : page.route);
	// The purpose line under the H1 becomes the page description (search results, link previews).
	const lead = body.split('\n\n')[0].trim();
	const description = /^[A-Za-z]/.test(lead)
		? lead.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*]/g, '').replace(/\s+/g, ' ')
		: '';
	const fm =
		`---\ntitle: ${yaml(title)}\n` +
		(description ? `description: ${yaml(description)}\n` : '') +
		`editUrl: ${REPO}/edit/main/${page.src}\n---\n\n`;
	const dest = join(contentDir, `${page.route}.md`);
	mkdirSync(dirname(dest), { recursive: true });
	writeFileSync(dest, fm + transformProse(body, page.src));
}

console.log(`[sync-docs] synced ${PAGES.length} pages from the repo's Markdown`);
