// jest-dom's typings attach its matchers to `jest.Matchers` and to Vitest 4's
// single-parameter `Assertion<T>`. Vitest 5 reads neither (custom matchers now
// augment `Matchers<R, T>`), so `toBeInTheDocument` & co. vanish from `expect()`
// in svelte-check. Re-attach them here; drop this once jest-dom ships Vitest 5
// typings.
//
// The interface merges into Vitest's own, so it must repeat its type parameters
// (T unused) and has no members of its own.
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
	interface Matchers<
		R extends void | Promise<void> = void | Promise<void>,
		T = unknown
	> extends TestingLibraryMatchers<unknown, R> {}
}
