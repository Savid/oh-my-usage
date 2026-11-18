export interface RollingNumberProps {
  /** The number as it should read, already formatted: "1,284", "$54.57". */
  value: string;

  /** Classes for the figure: its size, weight and colour. */
  className?: string;
}
