import { describe, expect, it } from 'vitest';
import { KNOWN_PROVIDERS } from './accounts';
import { providerMark } from './providerMarks';

describe('providerMark', () => {
  it('has a mark for every provider omp knows that publishes one', () => {
    expect(KNOWN_PROVIDERS.filter(provider => !providerMark(provider))).toEqual([
      'abliteration',
      'aiand',
      'charm-hyper',
      'coralbricks',
      'coreweave',
      'factory-droid',
      'helmcode',
      'litellm',
      'llama.cpp',
      'local',
      'modular',
      'nanogpt',
      'otari',
      'parallel',
      'singularityapi-dev',
      'singularityapi-tech',
      'stencil',
      'synthetic',
      'umans',
      'web',
      'yolo-auto',
      'zenmux',
    ]);
  });

  it("gives a provider's products the provider's mark", () => {
    expect(providerMark('openai-codex')).toBe(providerMark('openai'));
    expect(providerMark('muse-code')).toBe(providerMark('meta'));
    expect(providerMark('google-antigravity')).not.toBe(providerMark('google-gemini-cli'));
  });

  it('draws each mark on the 24 by 24 grid', () => {
    for (const provider of KNOWN_PROVIDERS) {
      for (const part of providerMark(provider)?.paths ?? []) {
        expect(part.d, provider).toMatch(/^M/i);
      }
    }
  });
});
