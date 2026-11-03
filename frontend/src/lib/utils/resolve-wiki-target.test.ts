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
	page('/lab/old-ap', 'Old access point', { aliases: ['wifi'] })
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
		['Nowhere Else', '/nowhere-else', false, 'nothing matches']
	])('%s -> %s (%s)', (target, path, exists) => {
		expect(resolveWikiTarget(target, documents)).toEqual({ path, exists });
	});
});
