import { Tooltip } from '@base/primitives/tooltip';
import '@base/primitives/tooltip/tooltip.css';
import type { ReactNode } from 'react';

interface TipProps {
  /** Tooltip text */
  content: string;
  /** Placement — defaults to 'top', auto-flips to 'bottom' when near top edge */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

/**
 * Thin tooltip wrapper for icon-only buttons.
 * Usage: <Tip content="Delete"><Button iconOnly ... /></Tip>
 */
export function Tip({ content, placement = 'top', children }: TipProps) {
  return (
    <Tooltip content={content} placement={placement} delay={400}>
      {children}
    </Tooltip>
  );
}
