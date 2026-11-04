import { describe, it, expect } from 'vitest';
import { resolveWikiTarget } from './resolve-wiki-target.ts';

const page = (path: string, title: string, properties?: Record<string, unknown>) => ({
	metaData: { path, title, properties }
});

const documents = [
	page('/lab/devices/router', 'router — main gateway'),
	page('/a/readme', 'Readme A'),
	page('/b/readme', 'Readme B'),
	page('/guide', 'Guide'),
	page('/docs/guide', 'Nested guide'),
	page('/notes/plan', 'Plan'),
	page('/lab/devices/switch', 'Core switch', { aliases: ['core', 'Backbone'] }),
	page('/lab/devices/ap', 'Access point', { aliases: 'wifi' }),
	page('/lab/old-ap', 'Old access point', { aliases: ['wifi'] }),
	page('/one/overview', 'Overview'),
	page('/two/overview', 'Overview'),
	page('/two/Setup-Notes', 'Setup')
];

describe('resolveWikiTarget', () => {
	it.each([
		['Plan', '/notes/plan', true, 'title'],
		['core switch', '/lab/devices/switch', true, 'title, any case'],
		['guide', '/guide', true, 'the root page before a page named guide'],
		['core', '/lab/devices/switch', true, 'alias'],
		['backbone', '/lab/devices/switch', true, 'alias, any case'],
		['router', '/lab/devices/router', true, 'page name (file name)'],
		['ROUTER', '/lab/devices/router', true, 'page name, any case'],
		['readme', '/readme', false, 'two pages share the name'],
		['wifi', '/wifi', false, 'two pages share the alias'],
		['Nowhere Else', '/nowhere-else', false, 'nothing matches'],
		['Overview', '/overview', false, 'two pages share the title (#333)'],
		['/one/overview', '/one/overview', true, 'path link'],
		['two/overview', '/two/overview', true, 'path link without the slash'],
		['Two/Overview.md', '/two/overview', true, 'path link, any case, with .md'],
		['two/setup-notes', '/two/Setup-Notes', true, 'path link to a page with capitals'],
		['/nowhere/page', '/nowherepage', false, 'path link to no page']
	])('%s -> %s (%s)', (target, path, exists) => {
		expect(resolveWikiTarget(target, documents)).toEqual({ path, exists });
	});

	it.each<[string | undefined, string, boolean, string]>([
		['/one/deep/plan', '/one/overview', true, 'the nearest folder wins'],
		['/two/plan', '/two/overview', true, 'a sibling'],
		['/three/plan', '/overview', false, 'both are as near'],
		[undefined, '/overview', false, 'not linked from a page']
	])('Overview from %s -> %s (%s)', (from, path, exists) => {
		expect(resolveWikiTarget('Overview', documents, from)).toEqual({ path, exists });
	});
});
