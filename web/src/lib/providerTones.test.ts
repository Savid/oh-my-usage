import { describe, expect, it } from 'vitest';
import { providerTone } from './providerTones';

describe('providerTone', () => {
  it("dresses a provider's products in the provider's colour", () => {
    expect(providerTone('openai-codex')).toBe(providerTone('openai'));
    expect(providerTone('opencode-go').fill).toBe('fill-mono');
    expect(providerTone('anthropic').glow).toBe('text-anthropic-track');
    expect(providerTone('openrouter').line).toBe('stroke-openrouter');
  });

  it('draws a provider whose mark is black and white in grey', () => {
    for (const provider of ['opencode-go', 'cursor', 'github-copilot', 'xai-oauth', 'ollama', 'zai', 'kimi-code']) {
      expect(providerTone(provider), provider).toBe(providerTone('opencode-zen'));
    }
    expect(providerTone('cursor').glow).toBe('text-mono-track');
  });

  it("falls back to the app's data colour for a provider it has no colour for", () => {
    expect(providerTone('some-new-provider')).toEqual({
      icon: 'text-muted',
      fill: 'fill-meter',
      track: 'fill-meter-track',
      line: 'stroke-meter',
      glow: 'text-meter-track',
    });
  });
});
