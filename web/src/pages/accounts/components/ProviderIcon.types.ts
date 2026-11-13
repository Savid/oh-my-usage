export interface ProviderIconProps {
  /** omp's provider ID, such as `anthropic`. */
  provider: string;

  /**
   * True when the provider's name is written beside the icon, so the icon
   * itself is hidden from assistive technology.
   * @default false
   */
  decorative?: boolean;
}
