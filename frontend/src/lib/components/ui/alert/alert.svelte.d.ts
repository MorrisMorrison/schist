import { type VariantProps } from 'tailwind-variants';

export declare const alertVariants: {
	(props?: { variant?: 'default' | 'destructive' }): string;
};

export declare type AlertVariant = VariantProps<typeof alertVariants>['variant'];
