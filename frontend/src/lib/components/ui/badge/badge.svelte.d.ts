import { type VariantProps } from 'tailwind-variants';

export declare const badgeVariants: {
	(props?: {
		variant?: 'default' | 'secondary' | 'destructive' | 'outline';
	}): string;
};

export declare type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];