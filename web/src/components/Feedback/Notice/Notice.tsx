import type { JSX } from 'react';
import clsx from 'clsx';
import type { NoticeProps, NoticeTone } from './Notice.types';

const noticeClasses: Record<NoticeTone, string> = {
  warn: 'bg-warn-subtle',
  danger: 'bg-danger-subtle',
};

const markClasses: Record<NoticeTone, string> = {
  warn: 'text-warn',
  danger: 'text-danger',
};

/** The mark of each tone, drawn in currentColor: a triangle that warns, a circle that stops. */
function Mark({ tone }: { tone: NoticeTone }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx('mt-px size-4 shrink-0', markClasses[tone])}
    >
      {tone === 'warn' ? <path d="M8 2.25 14.25 13.25H1.75z" /> : <circle cx="8" cy="8" r="6.25" />}
      <path d={tone === 'warn' ? 'M8 6.5v3' : 'M8 4.75v3.75'} />
      <path d={tone === 'warn' ? 'M8 11.5v.01' : 'M8 11v.01'} />
    </svg>
  );
}

/**
 * Something the page needs a person to know, on a ground in its tone: what is
 * wrong in a few words, under its mark, then what that means for what the page
 * shows.
 */
export function Notice({ tone = 'warn', title, children }: NoticeProps): JSX.Element {
  return (
    <div
      role="alert"
      data-tone={tone}
      className={clsx('flex items-start gap-2.5 rounded-md px-3 py-2 text-caption', noticeClasses[tone])}
    >
      <Mark tone={tone} />
      <div className="flex min-w-0 flex-col">
        <p className="font-semibold text-foreground">{title}</p>
        {children && <p className="text-muted">{children}</p>}
      </div>
    </div>
  );
}
