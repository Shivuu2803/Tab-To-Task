import {
  ButtonHTMLAttributes,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50 disabled:cursor-not-allowed',
  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger:
    'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40',
};

export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

const FIELD_STYLES =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} {...props} className={`${FIELD_STYLES} ${className}`} />;
  },
);

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${FIELD_STYLES} resize-y ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
        {hint && <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-500">{body}</p>
    </div>
  );
}

/** Inline, dismissible status line. Used for save confirmations and errors. */
export function Banner({ tone, children }: { tone: 'info' | 'error'; children: ReactNode }) {
  const styles =
    tone === 'error'
      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-100';
  return <div className={`rounded-lg px-3 py-2 text-xs ${styles}`}>{children}</div>;
}
