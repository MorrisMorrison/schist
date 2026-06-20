import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// Allow underscore-prefixed unused variables
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			// eslint-plugin-svelte enabled this in its recommended set: it wants every
			// goto()/pushState()/replaceState() path wrapped in resolve() for typed
			// routing. Adopting that is a deliberate refactor across ~40 call sites, so
			// it shouldn't be forced by a dependency bump -- defer it to its own PR.
			'svelte/no-navigation-without-resolve': 'off',
			// Also newly enabled in the recommended set: it wants SvelteSet/SvelteMap
			// instead of a plain Set/Map. Our reactive collections use the valid
			// "reassign a new Set" pattern (selectedDocuments/expandedFolders are
			// $state, so reassignment triggers reactivity) -- not a bug. Switching to
			// SvelteSet is a deliberate refactor, so defer it to its own PR too.
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		files: [
			'src/lib/components/document/DocumentView.svelte',
			'src/lib/components/editor/MarkdownPreview.svelte',
			'src/lib/components/markdown/*.svelte',
			'src/routes/share/*/+page.svelte'
		],
		rules: {
			'svelte/no-at-html-tags': 'off'
		}
	}
);
