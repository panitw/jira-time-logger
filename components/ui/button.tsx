import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from './utils';

/**
 * Button hierarchy per UX-DR25, plus `chrome` (Story 7.7, D-7.7-25 — Finding
 * 14c corrected this doc comment from "three-tier" after the fourth variant
 * landed).
 *   primary   — brand-purple bg + white text; one per visible surface
 *   secondary — transparent bg + neutral-700 text + 1 px neutral-200 border
 *   ghost     — transparent bg + neutral-500 text; inline/hover-revealed actions
 *   chrome    — white bg + primary text; the ONE variant for a CTA sitting
 *               directly on the purple chrome-gradient surface (see below)
 */
const buttonVariants = cva(
  // Base — focus ring 2px accent.DEFAULT with 2px offset per UX-DR32 / NFR13.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-neutral-300',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-white font-semibold hover:bg-accent-hover focus-visible:bg-accent-hover',
        secondary:
          'bg-transparent text-neutral-700 border border-neutral-200 hover:bg-neutral-100',
        ghost: 'bg-transparent text-neutral-500 hover:bg-neutral-100',
        // Story 7.7, D-7.7-25: the chrome header's primary CTA sits ON the
        // purple gradient, so it inverts — white fill, primary-purple text
        // — instead of the data-canvas primary button. Zero new colours:
        // `bg-surface`/`text-primary`/`hover:bg-primary-soft` are all
        // already-declared tokens (`imports/jira-time-logger.dc.html:366`'s
        // hover `#ECEBF3` IS `--color-primary-soft`, `globals.css:127`).
        chrome:
          'bg-surface text-primary font-semibold shadow-[0_2px_6px_rgba(30,27,46,0.18)] hover:bg-primary-soft focus-visible:bg-primary-soft',
      },
      size: {
        default: 'px-4 py-2',
        sm: 'px-3 py-1.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
