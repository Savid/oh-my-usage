/**
 * The colour tokens, grouped as the Foundations docs present them, and the
 * contrast each must reach. Values live only in tokens.css; tokens.test.ts
 * fails if the two disagree. Other tokens are read from tokens.css itself.
 */

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Where content sits, back to front. */
export const SURFACE_COLORS = ['background', 'surface', 'raised'] as const;
export const BORDER_COLORS = ['border', 'border-strong'] as const;
export const TEXT_COLORS = ['foreground', 'muted'] as const;
export const ACCENT_COLORS = ['accent', 'accent-foreground', 'focus'] as const;
export const STATUS_COLORS = ['ok', 'warn', 'danger'] as const;
/** Marks that draw data: meter fills and their tracks, chart series. */
export const DATA_COLORS = [
  'meter',
  'meter-track',
  'meter-edge',
  'warn-track',
  'warn-edge',
  'danger-track',
  'danger-edge',
  'series-1',
  'series-2',
  'series-3',
] as const;

export const COLOR_TOKENS = [
  ...SURFACE_COLORS,
  ...BORDER_COLORS,
  ...TEXT_COLORS,
  ...ACCENT_COLORS,
  ...STATUS_COLORS,
  ...DATA_COLORS,
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export interface ContrastRule {
  /** What the rule protects, as the docs name it. */
  name: string;
  foregrounds: readonly ColorToken[];
  backgrounds: readonly ColorToken[];
  /** WCAG 2.2 AA: 4.5 for text, 3 for outlines and marks. */
  minimum: number;
}

/** Every pair tokens.test.ts checks in both themes, and the Colours page shows. */
export const CONTRAST_RULES: readonly ContrastRule[] = [
  {
    name: 'Text and status colours on every surface',
    foregrounds: [...TEXT_COLORS, 'accent', ...STATUS_COLORS],
    backgrounds: SURFACE_COLORS,
    minimum: 4.5,
  },
  {
    name: 'Control outlines and the focus ring on every surface',
    foregrounds: ['border-strong', 'focus'],
    backgrounds: SURFACE_COLORS,
    minimum: 3,
  },
  {
    name: 'Text on an accent fill',
    foregrounds: ['accent-foreground'],
    backgrounds: ['accent'],
    minimum: 4.5,
  },
  {
    name: "Text over the wash of a row's chart",
    foregrounds: TEXT_COLORS,
    backgrounds: ['meter-track', 'warn-track', 'danger-track'],
    minimum: 4.5,
  },
  {
    name: 'A warning figure over its own wash',
    foregrounds: ['warn'],
    backgrounds: ['warn-track'],
    minimum: 4.5,
  },
  {
    name: 'A spent figure over its own wash',
    foregrounds: ['danger'],
    backgrounds: ['danger-track'],
    minimum: 4.5,
  },
  {
    name: 'Gauge fills and the first chart series on a panel',
    foregrounds: ['meter', 'series-1'],
    backgrounds: ['surface', 'raised'],
    minimum: 3,
  },
];

/** Colours no contrast rule covers, and why none needs to. */
export const CONTRAST_EXEMPT: Readonly<Partial<Record<ColorToken, string>>> = {
  border: 'separates; it identifies nothing you act on',
  'meter-edge': "the top of a row's chart, behind its text; the figures on the row carry the values",
  'warn-edge': "the top of a row's chart, behind its text; the figures on the row carry the values",
  'danger-edge': "the top of a row's chart, behind its text; the figures on the row carry the values",
  'series-2': 'a chart line that is always named in a legend and listed in the table beside the chart',
  'series-3': 'a chart line that is always named in a legend and listed in the table beside the chart',
};
