import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GenerationError,
  formatWei,
  generateContract,
  parseDuration,
  solString,
  toScaled,
} from '../src/lib/generator.js';
import { compile } from './compile.js';

const sample = JSON.parse(fs.readFileSync(new URL('../src/sample/smart-license.json', import.meta.url), 'utf8'));
const flat = JSON.parse(fs.readFileSync(new URL('./fixtures/flat-all-types.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(sample));

describe('helpers', () => {
  it('parses durations', () => {
    expect(parseDuration('3Y 0M 0D')).toBe(3 * 365 * 86400);
    expect(parseDuration('1M 0D')).toBe(30 * 86400);
    expect(parseDuration('0Y 0M 15D')).toBe(15 * 86400);
    expect(() => parseDuration('soon')).toThrow();
    expect(() => parseDuration('0Y 0M 0D')).toThrow();
  });

  it('scales decimals exactly', () => {
    expect(toScaled('50.00', 18)).toBe(50n * 10n ** 18n);
    expect(toScaled(0.02, 18)).toBe(2n * 10n ** 16n);
    expect(toScaled('0.1', 18)).toBe(10n ** 17n);
    expect(() => toScaled('0.0000000000000000001', 18)).toThrow();
    expect(() => toScaled('-1', 18)).toThrow();
  });

  it('formats wei', () => {
    expect(formatWei(50n * 10n ** 18n)).toBe('50 ether');
    expect(formatWei(2n * 10n ** 16n)).toBe('0.02 ether');
    expect(formatWei(20n)).toBe('20 wei');
    expect(formatWei(0n)).toBe('0');
  });

  it('escapes Solidity strings', () => {
    expect(solString('a "b"\n\\')).toBe('"a \\"b\\"\\n\\\\"');
    expect(solString('è')).toBe('"\\xc3\\xa8"');
  });
});

describe('generateContract', () => {
  it('generates one contract with both rules for the sample', () => {
    const { code, warnings } = generateContract(sample);
    expect(warnings).toEqual([]);
    expect(code).toContain('contract SmartLicense is Ownable, ReentrancyGuard');
    expect(code).toContain('uint256 amount = 50 ether;');
    expect(code).toContain('IGetGPSDistance(0x3456789012345678901234567890123456789012).getGPSDistance()');
    expect(code).toContain('usage * 0.02 ether');
    expect(code).toContain('(usage - 1000) * 0.1 ether');
  });

  it('re-computes EIP-55 checksums (Solidity rejects wrong ones)', () => {
    const { code } = generateContract(sample);
    expect(code).toContain('0x742d35Cc6634C0532925A3B8D4C9dB96C4B4d8B6');
  });

  it('supports the cliff mode', () => {
    const { code } = generateContract(sample, { stepMode: 'cliff' });
    expect(code).toContain('if (usage <= 500) return usage * 0.05 ether;');
    expect(code).not.toContain('royalty +=');
  });

  it('reports every validation problem at once', () => {
    const bad = clone();
    bad.parties.licensor = '0x123';
    bad.versions[0].data.duration = 'forever';
    bad.versions[0].data.rules[0].validityEnd = 'nope';
    try {
      generateContract(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationError);
      expect(e.errors.length).toBe(3);
    }
  });

  it('warns about unsupported rate types and generates a TODO stub', () => {
    const odd = clone();
    odd.versions[0].data.rules[0].royaltyRate.type = 'fancy';
    const { code, warnings } = generateContract(odd);
    expect(warnings.some((w) => w.includes('not supported'))).toBe(true);
    expect(code).toContain('TODO');
  });

  it('accepts the flat layout of the wizard and supports every rate type', () => {
    const { code, warnings } = generateContract(flat);
    expect(code).toContain('if (amount < 15 ether) amount = 15 ether;');
    expect(code).toContain('uint256 amount = 0.5 ether * rb0;');
    expect(code).toContain('_timeAxisDays(2)');
    expect(code).toContain('_wmul((rb0 * 1 ether), 0.1 ether)');
    expect(warnings.some((w) => w.includes('"time" x-axis'))).toBe(true);
  });

  it('explains what is wrong when the wizard JSON is incomplete', () => {
    const bad = JSON.parse(JSON.stringify(flat));
    bad.licensor = 'ACME Inc.';
    bad.rules[1].royaltyBase[0].oracleAddress = '';
    bad.rules[4].royaltyRate.customInputs[1].inputs = [];
    try {
      generateContract(bad);
      expect.unreachable();
    } catch (e) {
      expect(e.errors.some((m) => m.includes('licensor'))).toBe(true);
      expect(e.errors.some((m) => m.includes('oracle address'))).toBe(true);
      expect(e.errors.some((m) => m.includes('no inputs'))).toBe(true);
    }
  });

  it('selects the requested version', () => {
    const multi = clone();
    const v2 = JSON.parse(JSON.stringify(multi.versions[0]));
    v2.versionNumber = 2;
    v2.data.rules = [multi.versions[0].data.rules[0]];
    multi.versions.push(v2);
    expect(generateContract(multi, { versionNumber: 1 }).model.rules.length).toBe(2);
    expect(generateContract(multi, { versionNumber: 2 }).model.rules.length).toBe(1);
  });
});

describe('solc compilation', () => {
  for (const oz of ['4', '5']) {
    for (const stepMode of ['marginal', 'cliff']) {
      it(`compiles with OpenZeppelin v${oz} (${stepMode})`, () => {
        const { code } = generateContract(sample, { ozVersion: oz, stepMode });
        const result = compile(code, oz);
        expect(result.errors.map((e) => e.formattedMessage)).toEqual([]);
        expect(Object.keys(result.contracts)).toContain('SmartLicense');
      });
    }
  }

  it('compiles the flat layout with every rate type (OpenZeppelin v4/v5, both units)', () => {
    for (const oz of ['4', '5']) {
      for (const amountUnit of ['ether', 'gwei']) {
        const { code } = generateContract(flat, { ozVersion: oz, amountUnit });
        expect(compile(code, oz).errors.map((e) => e.formattedMessage)).toEqual([]);
      }
    }
  });

  it('compiles a license with several oracles, special characters and a stub rule', () => {
    const j = clone();
    const data = j.versions[0].data;
    data.ips = 'Quoted "IP" with è and \\ backslash\nnew line */ end';
    data.rules[1].royaltyBase.push({
      id: 'x',
      oracleAddress: '0x4567890123456789012345678901234567890123',
      propertyName: 'getTrips',
      displayName: 'Trips',
      intellectualProperty: 'PAT-9 */ evil',
    });
    data.rules.push({
      ...data.rules[0],
      id: 'rb-03',
      royaltyBase: [data.rules[1].royaltyBase[1]],
      royaltyRate: { type: 'proportional', value: '0.001', proportionalRB: 'Trips' },
    });
    data.rules.push({ ...data.rules[0], id: 'rb-04', royaltyRate: { type: 'fancy' } });
    const { code } = generateContract(j);
    const result = compile(code, '4');
    expect(result.errors.map((e) => e.formattedMessage)).toEqual([]);
  });
});
