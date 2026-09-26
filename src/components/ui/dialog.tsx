import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * มือถือ: เลื่อนขึ้นจากด้านล่างเต็มความกว้าง (sheet)
 * เดสก์ท็อป: กล่องกลางจอ
 */
export function DialogContent({
  children,
  className,
  title,
  description,
  footer,
  size = 'md',
}: {
  children: ReactNode;
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_.2s_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-xl border bg-card shadow-lift',
          'data-[state=open]:animate-slide-in',
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88dvh] sm:w-[min(94vw,var(--dw))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          // เดสก์ท็อปต้องใช้แอนิเมชันคนละตัว ไม่งั้นการจัดกลางจอถูกล้างตอนแอนิเมชันจบ
          'sm:data-[state=open]:animate-dialog-in',
          size === 'lg' ? '[--dw:900px]' : '[--dw:560px]',
          className,
        )}
      >
        <div className="brand-stripe h-[3px] shrink-0 rounded-t-xl opacity-90" />
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="truncate text-base font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close className="press focusable -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-4 py-3 pb-safe">
            {footer}
          </div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
