// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

interface ImportMetaEnv {
	readonly VITE_API_BASE_URL: string;
	readonly VITE_API_TIMEOUT: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export {};
