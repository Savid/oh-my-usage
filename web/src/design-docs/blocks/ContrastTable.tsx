import type { JSX } from 'react';
import { contrastRatio } from '@/styles/contrast';
import { colorValue } from '@/styles/tokenSource';
import { THEMES, type ContrastRule } from '@/styles/tokens';
import { Table } from './Table';

interface ContrastTableProps {
  /** The rule to show: its foregrounds are rows, its backgrounds columns per theme. */
  rule: ContrastRule;
}

/**
 * A contrast rule's pairs in both themes, as tokens.test.ts checks them. Each
 * cell shows the pair as a swatch (a bar of the foreground on the background)
 * and states the ratio in readable text. The longer of the two lists runs
 * down the rows, so a rule with many colours grows longer, not wider.
 */
export function ContrastTable({ rule }: ContrastTableProps): JSX.Element {
  const { name, foregrounds, backgrounds, minimum } = rule;
  const byBackground = backgrounds.length > foregrounds.length;
  const [rowTokens, columnTokens] = byBackground ? [backgrounds, foregrounds] : [foregrounds, backgrounds];
  const columns = THEMES.flatMap(theme => columnTokens.map(token => ({ theme, token })));
  return (
    <Table
      caption={`${name}: at least ${minimum}:1`}
      head={[
        byBackground ? 'on token' : 'token',
        ...columns.map(({ theme, token }) => (byBackground ? `${theme} · ${token}` : `${theme} · on ${token}`)),
      ]}
      rows={rowTokens.map(row => ({
        key: row,
        cells: [
          row,
          ...columns.map(({ theme, token }) => {
            const [foreground, background] = byBackground ? [token, row] : [row, token];
            const ratio = contrastRatio(colorValue(theme, foreground), colorValue(theme, background));
            return (
              <span key={`${theme}-${token}`} className="flex items-center gap-2 font-mono text-caption">
                <span
                  aria-hidden="true"
                  className="grid h-5 w-8 shrink-0 place-items-center rounded-sm border border-border"
                  style={{ backgroundColor: colorValue(theme, background) }}
                >
                  <span className="h-1 w-5 rounded-full" style={{ backgroundColor: colorValue(theme, foreground) }} />
                </span>
                {ratio.toFixed(2)} {ratio >= minimum ? 'pass' : 'FAIL'}
              </span>
            );
          }),
        ],
      }))}
    />
  );
}
