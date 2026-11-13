export interface LogoProps {
  /**
   * Whether the logo moves: each leg fills like a usage meter and empties when its window resets.
   * It holds still regardless when the viewer asked their system for less motion.
   * @default true
   */
  animated?: boolean;
}
