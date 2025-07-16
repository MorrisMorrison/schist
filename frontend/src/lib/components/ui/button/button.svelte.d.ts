import { type VariantProps } from 'tailwind-variants';
import { type WithElementRef } from '$lib/utils.js';
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

export declare const buttonVariants: {
	(props?: {
		variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
		size?: 'default' | 'sm' | 'lg' | 'icon';
	}): string;
};

export declare type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
export declare type ButtonSize = VariantProps<typeof buttonVariants>['size'];
export declare type ButtonProps = WithElementRef<HTMLButtonAttributes> &
	WithElementRef<HTMLAnchorAttributes> & {
		variant?: ButtonVariant;
		size?: ButtonSize;
	};