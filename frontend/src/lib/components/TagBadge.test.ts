import { describe, it, expect } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import TagBadge from './TagBadge.svelte';
import { badgeVariants } from '#lib/components/ui/badge/badge.svelte';

describe('TagBadge', () => {
	it('shows a tag in the brand tag style', () => {
		const { container } = render(TagBadge, { props: { tag: 'homelab' } });
		const badge = container.querySelector('[data-slot="badge"]') as HTMLElement;

		expect(badge).toHaveTextContent('homelab');
		expect(badge).toHaveAttribute('title', 'Tag: homelab');
		expect(badge.className).toContain('bg-[var(--tag-bg)]');
		expect(badge.className).toContain('text-[var(--tag-fg)]');
		expect(container.querySelector('[data-tag-prefix]')).toBeNull();
	});

	it('mutes the prefix of a nested tag', () => {
		const { container } = render(TagBadge, { props: { tag: 'device/desktop' } });
		const prefix = container.querySelector('[data-tag-prefix]') as HTMLElement;

		expect(container.querySelector('[data-slot="badge"]')).toHaveTextContent('device/desktop');
		expect(prefix).toHaveTextContent('device/');
		expect(prefix.className).toContain('text-[var(--tag-prefix)]');
		// The badge is a flex box with a gap: prefix and name must share one
		// inline wrapper, or they render apart ("device/ desktop").
		const badge = container.querySelector('[data-slot="badge"]') as HTMLElement;
		expect(prefix.parentElement).not.toBe(badge);
		expect(prefix.parentElement).toHaveTextContent('device/desktop');
	});

	it('keeps the whole path of a deeper tag in the prefix', () => {
		const { container } = render(TagBadge, { props: { tag: 'lab/devices/router' } });
		expect(container.querySelector('[data-tag-prefix]')).toHaveTextContent('lab/devices/');
	});

	it('has a tag variant in the badge library', () => {
		expect(badgeVariants({ variant: 'tag' })).toContain('border-[var(--tag-border)]');
	});
});
