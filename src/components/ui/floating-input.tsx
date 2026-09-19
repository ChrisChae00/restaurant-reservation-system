import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingInputProps extends Omit<React.ComponentProps<'input'>, 'placeholder'> {
  label: string;
  icon?: LucideIcon;
}

// The label sits inside the input and floats onto the border on focus or once there is a
// value. Positioning is driven by :placeholder-shown (hence the blank placeholder) rather
// than React state, so it also holds for values set by the parent and for browser autofill,
// neither of which fires this input's onChange.
export function FloatingInput({ label, icon: Icon, id, className, ...props }: FloatingInputProps) {
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;

  return (
    <div className="relative">
      <input
        id={inputId}
        placeholder=" "
        className={cn(
          'peer h-12 w-full rounded-lg border border-gold/20 bg-transparent px-4 text-base text-foreground outline-none transition-colors',
          'focus:border-gold focus-visible:ring-[3px] focus-visible:ring-gold/20',
          'aria-invalid:border-destructive',
          Icon && 'pl-11',
          className
        )}
        {...props}
      />
      {/* Siblings after the input so peer-focus can recolor them */}
      {Icon && (
        <Icon
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors peer-focus:text-gold"
        />
      )}
      {/* Once floated, bg-card masks the border line where the label crosses it */}
      <label
        htmlFor={inputId}
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 px-1 text-base text-muted-foreground transition-all duration-200',
          Icon ? 'left-10' : 'left-3',
          'peer-focus:left-3 peer-focus:top-0 peer-focus:bg-card peer-focus:text-xs peer-focus:text-gold',
          'peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:bg-card peer-[:not(:placeholder-shown)]:text-xs'
        )}
      >
        {label}
      </label>
    </div>
  );
}
