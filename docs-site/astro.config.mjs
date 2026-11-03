// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// GitHub Pages project site, served at https://<user>.github.io/schist/
const site = process.env.DOCS_SITE ?? 'https://morrismorrison.github.io';
const base = process.env.DOCS_BASE ?? '/schist';
const repo = 'https://github.com/MorrisMorrison/schist';

// Routes of the first site layout, kept working after the restructure (#337).
const redirects = {
	'/getting-started/quick-start': '/getting-started/installation',
	'/guides/configuration': '/reference/configuration',
	'/reference/api': '/reference/rest-api',
	'/project/development': '/development/setup',
	'/project/contributing': '/development/contributing',
	'/project/ci': '/development/ci-and-releases',
	'/project/design': '/development/architecture'
};

export default defineConfig({
	site,
	base,
	redirects: Object.fromEntries(Object.entries(redirects).map(([from, to]) => [from, `${base}${to}/`])),
	// The site only uses SVGs and remote screenshots: skip raster optimisation (and sharp).
	image: { service: passthroughImageService() },
	integrations: [
		starlight({
			title: 'Schist',
			logo: { src: './src/assets/logo.svg', alt: '' },
			description:
				'A lightweight, self-hosted markdown wiki. Plain files on disk, versioned with git, no database.',
			favicon: '/favicon.svg',
			customCss: ['./src/styles/custom.css'],
			social: [{ icon: 'github', label: 'GitHub', href: repo }],
			// Fails the build on a broken internal link or anchor. The docs tell readers to
			// open http://localhost:8080, so local links are allowed.
			plugins: [starlightLinksValidator({ errorOnLocalLinks: false })],
			// Pages are generated from the repo's Markdown by scripts/sync-docs.mjs.
			sidebar: [
				{
					label: 'Getting started',
					items: [
						'getting-started/introduction',
						'getting-started/installation',
						'getting-started/first-steps'
					]
				},
				{
					label: 'Guides',
					items: [
						'guides/writing-and-linking',
						'guides/import-and-export',
						'guides/github-backup',
						'guides/sharing',
						'guides/secrets',
						'guides/ai-assistants',
						'guides/users-and-passkeys'
					]
				},
				{
					label: 'Reference',
					items: [
						'reference/configuration',
						'reference/rest-api',
						'reference/mcp-tools',
						'reference/error-codes',
						'reference/keyboard-shortcuts'
					]
				},
				{
					label: 'Self-hosting',
					items: ['self-hosting/reverse-proxy', 'self-hosting/backups', 'self-hosting/upgrading']
				},
				{
					label: 'Development',
					items: [
						'development/setup',
						'development/architecture',
						'development/testing',
						'development/ci-and-releases',
						'development/docs-site',
						'development/contributing',
						{ label: 'Releases', link: `${repo}/releases` }
					]
				}
			]
		})
	]
});
