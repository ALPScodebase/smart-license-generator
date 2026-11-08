import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateContract } from '../src/lib/generator.js';
import { fromJson, toCanonicalJson } from '../src/lib/licenseSchema.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const flat = read('./fixtures/flat-all-types.json');
const sample = read('../src/sample/smart-license.json');

// The header comment mentions the version/status; everything else must be identical.
const body = (code) => code.split('\n').filter((l) => !l.startsWith('// Generated from')).join('\n');

describe('wizard <-> JSON round trip', () => {
  it('flat JSON -> wizard -> canonical JSON produces the same contract', () => {
    const { model, meta } = fromJson(flat);
    const canonical = toCanonicalJson(model, { ...meta, licenseId: 'LIC-ALL-RULE-TYPES' });
    expect(body(generateContract(canonical).code)).toBe(body(generateContract(flat).code));
  });

  it('canonical JSON -> wizard -> canonical JSON produces the same contract and keeps the history', () => {
    const { model, meta } = fromJson(sample);
    const canonical = toCanonicalJson(model, meta);
    expect(canonical.licenseId).toBe(sample.licenseId);
    expect(canonical.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(canonical.currentVersion).toBe(2);
    expect(body(generateContract(canonical).code)).toBe(body(generateContract(sample).code));
  });

  it('a new license starts at version 1 with a generated id', () => {
    const { model } = fromJson(flat);
    const canonical = toCanonicalJson(model, {});
    expect(canonical.currentVersion).toBe(1);
    expect(canonical.licenseId).toMatch(/^LIC-\d{4}-\d{3}$/);
  });

  it('rejects things that are not licenses', () => {
    expect(() => fromJson({ foo: 1 })).toThrow();
    expect(() => fromJson([])).toThrow();
  });
});
