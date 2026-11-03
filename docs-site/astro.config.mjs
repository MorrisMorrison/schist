// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// GitHub Pages project site, served at https://<user>.github.io/schist/
const site = process.env.DOCS_SITE ?? 'https://morrismorrison.github.io';
const base = process.env.DOCS_BASE ?? '/schist';
const repo = 'https://github.com/MorrisMorrison/schist';

export default defineConfig({
	site,
	base,
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
					items: ['getting-started/introduction', 'getting-started/quick-start']
				},
				{
					label: 'Guides',
					items: ['guides/configuration']
				},
				{
					label: 'Reference',
					items: ['reference/api']
				},
				{
					label: 'Project',
					items: [
						'project/development',
						'project/contributing',
						'project/ci',
						'project/design',
						{ label: 'Releases', link: `${repo}/releases` }
					]
				}
			]
		})
	]
});
