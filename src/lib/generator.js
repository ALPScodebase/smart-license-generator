import { getAddress } from 'ethers';

/* -------------------------------------------------------------------------- */
/*  Options                                                                    */
/* -------------------------------------------------------------------------- */

export const DEFAULT_OPTIONS = {
  contractName: 'SmartLicense',
  /** '4' -> OpenZeppelin Contracts v4.x, '5' -> OpenZeppelin Contracts v5.x */
  ozVersion: '4',
  /** Unit in which monetary values of the JSON (lumpsum value, step rates) are expressed. */
  amountUnit: 'ether',
  /** 'marginal' -> each bracket is charged at its own rate; 'cliff' -> the whole usage is charged at the matching bracket rate. */
  stepMode: 'marginal',
  /** Version number to convert; defaults to `currentVersion` of the JSON. */
  versionNumber: null,
};

const UNIT_DECIMALS = { ether: 18, gwei: 9, wei: 0 };

const DAY = 86400;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export class GenerationError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.name = 'GenerationError';
    this.errors = errors;
  }
}

/* -------------------------------------------------------------------------- */
/*  Small parsing helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Parses strings such as "3Y 0M 0D" or "1M 0D" into seconds.
 * Conventions: 1Y = 365 days, 1M = 30 days, 1D = 24h.
 */
export function parseDuration(input, label = 'duration') {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) return Math.floor(input);
  const str = String(input ?? '').trim();
  const re = /(\d+)\s*([YMD])/gi;
  let match;
  let seconds = 0;
  let found = false;
  while ((match = re.exec(str)) !== null) {
    found = true;
    const n = Number(match[1]);
    const unit = match[2].toUpperCase();
    seconds += n * (unit === 'Y' ? YEAR : unit === 'M' ? MONTH : DAY);
  }
  if (!found) throw new Error(`${label}: cannot parse "${str}" (expected something like "1Y 6M 0D")`);
  if (seconds <= 0) throw new Error(`${label}: must be greater than zero ("${str}")`);
  return seconds;
}

/** "2025-01-01" -> unix timestamp (UTC). With endOfDay the time is 23:59:59. */
export function toTimestamp(input, endOfDay, label = 'date') {
  const str = String(input ?? '').trim();
  let ms;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    ms = Date.parse(`${str}T${endOfDay ? '23:59:59' : '00:00:00'}Z`);
  } else {
    ms = Date.parse(str);
  }
  if (Number.isNaN(ms)) throw new Error(`${label}: invalid date "${str}" (expected YYYY-MM-DD)`);
  return Math.floor(ms / 1000);
}

function decimalString(value, label) {
  let s;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label}: invalid number`);
    s = value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  } else {
    s = String(value ?? '').trim();
  }
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`${label}: "${value}" is not a non-negative decimal number`);
  return s;
}

/** Decimal number (string or number) -> BigInt scaled by 10^decimals, with no floating point maths. */
export function toScaled(value, decimals, label = 'value') {
  const s = decimalString(value, label);
  const [int, frac = ''] = s.split('.');
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) {
    throw new Error(`${label}: "${value}" has more than ${decimals} decimals for the selected unit`);
  }
  return BigInt(int + frac.slice(0, decimals).padEnd(decimals, '0'));
}

function toChecksumAddress(value, label) {
  const str = String(value ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(str)) throw new Error(`${label}: "${str}" is not a valid 20-byte hex address`);
  // Solidity rejects address literals with a wrong EIP-55 checksum, so we always re-compute it.
  return getAddress(str.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/*  Solidity formatting helpers                                                */
/* -------------------------------------------------------------------------- */

/** Safe Solidity string literal (non-ASCII bytes are emitted as \xNN escapes). */
export function solString(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let out = '';
  for (const b of bytes) {
    if (b === 0x22) out += '\\"';
    else if (b === 0x5c) out += '\\\\';
    else if (b === 0x0a) out += '\\n';
    else if (b === 0x0d) out += '\\r';
    else if (b === 0x09) out += '\\t';
    else if (b < 0x20 || b > 0x7e) out += '\\x' + b.toString(16).padStart(2, '0');
    else out += String.fromCharCode(b);
  }
  return `"${out}"`;
}

const comment = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const ONE_ETHER = 10n ** 18n;

/** Wei amount -> readable Solidity literal ("50 ether", "0.02 ether", "20 wei"). */
export function formatWei(n) {
  if (n === 0n) return '0';
  if (n % 10n ** 12n === 0n) {
    const whole = n / ONE_ETHER;
    const frac = (n % ONE_ETHER).toString().padStart(18, '0').replace(/0+$/, '');
    return `${whole}${frac ? '.' + frac : ''} ether`;
  }
  return `${n} wei`;
}

function isoDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/*  Reading the input JSON (two accepted layouts)                               */
/* -------------------------------------------------------------------------- */

/**
 * Layout A ("canonical"): { licenseId, name, currentVersion, parties: {...}, versions: [{ versionNumber, data: {...} }] }
 * Layout B ("flat", produced by older builders): { name, licensor, licensee, territory, duration, ips, rules }
 */
export function listVersions(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.versions)) return [];
  return json.versions.map((v) => v.versionNumber);
}

export function defaultVersion(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.currentVersion != null) return json.currentVersion;
  const all = listVersions(json);
  return all.length ? all[all.length - 1] : null;
}

const slug = (s) =>
  String(s ?? 'license')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'LICENSE';

function readInput(json, versionNumber, errors) {
  if (Array.isArray(json.versions) && json.versions.length) {
    const wanted = Number(versionNumber ?? defaultVersion(json));
    const version = json.versions.find((v) => Number(v.versionNumber) === wanted);
    if (!version) {
      errors.push(`Version ${wanted} not found in "versions"`);
      return null;
    }
    return {
      licenseId: json.licenseId,
      name: json.name,
      parties: json.parties ?? {},
      versionNumber: version.versionNumber,
      status: version.status ?? json.status ?? '',
      data: version.data ?? {},
    };
  }
  if (json.data && typeof json.data === 'object') {
    return {
      licenseId: json.licenseId,
      name: json.name,
      parties: json.parties ?? {},
      versionNumber: json.currentVersion ?? 1,
      status: json.status ?? '',
      data: json.data,
    };
  }
  if (Array.isArray(json.rules)) {
    return {
      licenseId: json.licenseId ?? `LIC-${slug(json.name)}`,
      name: json.name,
      parties: { licensor: json.licensor, licensee: json.licensee, territory: json.territory },
      versionNumber: json.currentVersion ?? 1,
      status: json.status ?? '',
      data: { duration: json.duration, ips: json.ips, rules: json.rules },
    };
  }
  errors.push('Unrecognised JSON: expected a "versions" array or a flat license with a "rules" array');
  return null;
}

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const pick = (...values) => values.find((v) => !blank(v));

/* -------------------------------------------------------------------------- */
/*  Rules -> "plan" (Solidity snippets + metadata)                              */
/* -------------------------------------------------------------------------- */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FUNCS = ['sum', 'multiply', 'divide', 'subtract', 'max', 'min'];
const interfaceName = (prop) => `I${prop.charAt(0).toUpperCase()}${prop.slice(1)}`;

/** Solidity of a bracket lookup: the rate (or amount) of the bracket where x falls. */
function renderStepLookup(fn, steps, tail) {
  const L = [];
  L.push(`    function ${fn}(uint256 x) internal pure returns (uint256) {`);
  steps.forEach((s) => L.push(`        if (x <= ${s.threshold}) return ${formatWei(s.rate)};`));
  L.push(`        return ${formatWei(tail)};`);
  L.push('    }');
  return L;
}

/** Solidity of a "step" royalty: usage charged per bracket (marginal) or at the matching bracket rate (cliff). */
function renderStepRoyalty(fn, steps, tail, mode) {
  const L = [];
  L.push(`    function ${fn}(uint256 usage) internal pure returns (uint256 royalty) {`);
  if (mode === 'marginal') {
    let prev = 0;
    steps.forEach((s, i) => {
      const range = prev === 0 ? `up to ${s.threshold}` : `${prev} - ${s.threshold}`;
      L.push(`        // ${range}: ${formatWei(s.rate)} per unit`);
      if (i === 0) {
        L.push(`        if (usage <= ${s.threshold}) return usage * ${formatWei(s.rate)};`);
        L.push(`        royalty = ${s.threshold} * ${formatWei(s.rate)};`);
      } else {
        const lower = prev === 0 ? '' : ` - ${prev}`;
        L.push(`        if (usage <= ${s.threshold}) return royalty + (usage${lower}) * ${formatWei(s.rate)};`);
        L.push(`        royalty += ${s.threshold - prev} * ${formatWei(s.rate)};`);
      }
      prev = s.threshold;
    });
    L.push(`        // above ${prev}: ${formatWei(tail)} per unit`);
    L.push(`        return royalty + (usage - ${prev}) * ${formatWei(tail)};`);
  } else {
    steps.forEach((s) => L.push(`        if (usage <= ${s.threshold}) return usage * ${formatWei(s.rate)};`));
    L.push(`        return usage * ${formatWei(tail)};`);
  }
  L.push('    }');
  return L;
}

/**
 * Turns one rule of the JSON into a plan:
 *   { amountExpr, reads, single, helpers, usesTime, clamp }
 * `errors`/`warnings` collect problems; nothing is thrown.
 */
function planRule(rule, index, ctx) {
  const { opts, decimals, errors, warnings } = ctx;
  const label = `Rule #${index + 1} (${rule?.id ?? 'no id'})`;
  const rate = rule?.royaltyRate ?? {};
  const type = String(rate.type ?? '').toLowerCase();
  const ident = ctx.ident;

  const check = (fn) => {
    try {
      return fn();
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
      return undefined;
    }
  };

  const bases = Array.isArray(rule?.royaltyBase) ? rule.royaltyBase : [];
  const seen = new Set();
  bases.forEach((b) => {
    if (blank(b?.displayName)) return;
    if (seen.has(b.displayName)) errors.push(`${label}: duplicated royalty base name "${b.displayName}"`);
    seen.add(b.displayName);
  });

  const reads = new Map(); // rb index -> { address, propertyName, displayName, intellectualProperty }

  /** Resolves a royalty base reference (by displayName, then id / propertyName) and registers it as "read". */
  const useRB = (ref, what) => {
    let i = -1;
    if (!blank(ref)) {
      i = bases.findIndex((b) => b?.displayName === ref);
      if (i < 0) i = bases.findIndex((b) => String(b?.id) === String(ref));
      if (i < 0) i = bases.findIndex((b) => b?.propertyName === ref);
      if (i < 0) throw new Error(`${what}: royalty base "${ref}" does not exist in this rule`);
    } else if (bases.length === 1) {
      i = 0;
    } else {
      throw new Error(`${what}: no royalty base selected`);
    }
    if (!reads.has(i)) {
      const b = bases[i];
      const address = toChecksumAddress(b?.oracleAddress, `royalty base "${b?.displayName ?? i}" oracle address`);
      const propertyName = String(b?.propertyName ?? '');
      if (!IDENT_RE.test(propertyName)) {
        throw new Error(`royalty base "${b?.displayName ?? i}": "${propertyName}" is not a valid Solidity function name`);
      }
      reads.set(i, {
        address,
        propertyName,
        displayName: b.displayName ?? propertyName,
        intellectualProperty: b.intellectualProperty ?? '',
      });
    }
    return i;
  };

  const plan = { type, reads, helpers: [], single: false, usesTime: false, amountExpr: null, mathHelpers: new Set(), min: null, max: null };

  // --- min / max (per evaluation period) -----------------------------------
  const min = blank(rate.min) ? null : check(() => toScaled(rate.min, decimals, 'min'));
  const max = blank(rate.max) ? null : check(() => toScaled(rate.max, decimals, 'max'));
  plan.min = min ? min : null;
  plan.max = max ? max : null;
  if (min && max && min > max) errors.push(`${label}: min value is greater than max value`);

  // --- step structure ----------------------------------------------------------
  const stepStructure = rate.stepStructure ?? {};
  const rawSteps = Array.isArray(stepStructure.steps) ? stepStructure.steps : [];
  const hasSteps = rawSteps.length > 0;
  let steps = [];
  let tail = null;
  let axis = null; // { kind: 'rb', index } | { kind: 'time' }

  const parseSteps = () => {
    steps = rawSteps
      .map((s, i) => ({
        threshold: Number(pick(s.threshold, s.x)),
        rate: check(() => toScaled(pick(s.rate, s.y), decimals, `step ${i + 1} value`)),
      }))
      .sort((a, b) => a.threshold - b.threshold);
    steps.forEach((s, i) => {
      if (!Number.isInteger(s.threshold) || s.threshold <= 0) {
        errors.push(`${label}: step thresholds must be positive integers (got "${s.threshold}")`);
      } else if (i > 0 && s.threshold === steps[i - 1].threshold) {
        errors.push(`${label}: duplicated step threshold ${s.threshold}`);
      }
    });
    const inf = pick(stepStructure.infiniteValue);
    if (inf !== undefined) {
      tail = check(() => toScaled(inf, decimals, 'infinite value'));
    } else {
      tail = steps[steps.length - 1]?.rate ?? 0n;
      warnings.push(`${label}: no value given for "above the last threshold", the last step value is used.`);
    }
  };

  const resolveAxis = () => {
    const x = stepStructure.xAxis;
    if (String(x).toLowerCase() === 'time') {
      plan.usesTime = true;
      warnings.push(
        `${label}: the "time" x-axis is read as the number of days elapsed from validityStart to the end of the period being settled.`,
      );
      return { kind: 'time' };
    }
    return { kind: 'rb', index: useRB(x, 'step structure x-axis') };
  };

  const xExpr = () => (axis.kind === 'time' ? `_timeAxisDays(${index})` : `rb${axis.index}`);

  // --- per type ------------------------------------------------------------------
  const lookupFn = `_stepLookup_${ident}`;

  if (type === 'lumpsum') {
    if (hasSteps) {
      check(parseSteps);
      axis = check(resolveAxis);
      if (steps.length && axis) {
        plan.helpers = renderStepLookup(lookupFn, steps, tail ?? 0n);
        plan.amountExpr = `${lookupFn}(${xExpr()})`;
        plan.single = true;
        if (!blank(pick(rate.value, rate.lumpsumValue))) {
          warnings.push(`${label}: both a single value and a step structure are set, the step structure is used.`);
        }
      }
    } else {
      const v = pick(rate.value, rate.lumpsumValue);
      if (blank(v)) errors.push(`${label}: the lumpsum value is missing`);
      else {
        const wei = check(() => toScaled(v, decimals, 'lumpsum value'));
        if (wei !== undefined) plan.amountExpr = formatWei(wei);
      }
    }
  } else if (type === 'proportional') {
    const rbIndex = check(() => useRB(rate.proportionalRB, 'proportional royalty base'));
    let rateExpr = null;
    if (hasSteps) {
      check(parseSteps);
      axis = check(resolveAxis);
      if (steps.length && axis) {
        plan.helpers = renderStepLookup(lookupFn, steps, tail ?? 0n);
        rateExpr = `${lookupFn}(${xExpr()})`;
        if (!blank(pick(rate.value, rate.proportionalValue))) {
          warnings.push(`${label}: both a single value and a step structure are set, the step structure is used.`);
        }
      }
    } else {
      const v = pick(rate.value, rate.proportionalValue);
      if (blank(v)) errors.push(`${label}: the proportional value is missing`);
      else {
        const wei = check(() => toScaled(v, decimals, 'proportional value'));
        if (wei !== undefined) rateExpr = formatWei(wei);
      }
    }
    if (rateExpr && rbIndex !== undefined) {
      plan.amountExpr = `${rateExpr} * rb${rbIndex}`;
      plan.single = true;
    }
  } else if (type === 'step') {
    if (!hasSteps) errors.push(`${label}: a "step" rate needs at least one step`);
    else {
      check(parseSteps);
      axis = check(resolveAxis);
      if (axis?.kind === 'time') errors.push(`${label}: a "step" rate must use a royalty base as x-axis, not time`);
      else if (steps.length && axis) {
        const fn = `_stepRoyalty_${ident}`;
        plan.helpers = renderStepRoyalty(fn, steps, tail ?? steps[steps.length - 1].rate, opts.stepMode);
        plan.amountExpr = `${fn}(${xExpr()})`;
        plan.single = true;
      }
    }
  } else if (type === 'custom') {
    if (hasSteps) warnings.push(`${label}: the step structure is ignored by custom rates.`);
    const inputs = Array.isArray(rate.customInputs) ? rate.customInputs : [];
    const fn = String(pick(rate.customFunc, 'sum')).toLowerCase();

    const combine = (f, a, b) => {
      switch (f) {
        case 'sum':
          return `(${a} + ${b})`;
        case 'multiply':
          plan.mathHelpers.add('wmul');
          return `_wmul(${a}, ${b})`;
        case 'divide':
          plan.mathHelpers.add('wdiv');
          return `_wdiv(${a}, ${b})`;
        case 'subtract':
          plan.mathHelpers.add('wsub');
          return `_wsub(${a}, ${b})`;
        case 'max':
          plan.mathHelpers.add('max');
          return `_max(${a}, ${b})`;
        case 'min':
          plan.mathHelpers.add('min');
          return `_min(${a}, ${b})`;
        default:
          throw new Error(`unknown function "${f}"`);
      }
    };

    const nodeExpr = (node, path) => {
      const where = `custom input ${path}`;
      if (node?.type === 'constant') {
        if (blank(node.value)) throw new Error(`${where}: constant value is missing`);
        return formatWei(toScaled(node.value, 18, `${where} constant`));
      }
      if (node?.type === 'rb') {
        const i = useRB(node.rb, where);
        return `(rb${i} * 1 ether)`;
      }
      if (node?.type === 'func') return foldExpr(String(node.func ?? 'sum').toLowerCase(), node.inputs, where);
      throw new Error(`${where}: unknown input type "${node?.type}"`);
    };

    const foldExpr = (f, list, where) => {
      if (!FUNCS.includes(f)) throw new Error(`${where}: unknown function "${f}"`);
      if (!Array.isArray(list) || list.length === 0) throw new Error(`${where}: the function has no inputs`);
      const parts = list.map((n, i) => nodeExpr(n, `${where}.${i + 1}`));
      return parts.slice(1).reduce((acc, p) => combine(f, acc, p), parts[0]);
    };

    const wad = check(() => foldExpr(fn, inputs, '(root)'));
    if (wad !== undefined) {
      const unitWei = 10n ** BigInt(decimals);
      const scaled = unitWei === ONE_ETHER ? wad : `${wad} * ${unitWei} / 1 ether`;
      plan.amountExpr = scaled;
      plan.single = reads.size > 0;
    }
  } else {
    warnings.push(
      `${label}: royalty rate type "${rate.type}" is not supported. A stub that returns 0 was generated, ` +
        'you must implement its calculation by hand (look for TODO in the code).',
    );
    plan.unsupported = true;
  }

  if (plan.usesTime) plan.single = true;
  return plan;
}

/* -------------------------------------------------------------------------- */
/*  JSON -> normalised model                                                   */
/* -------------------------------------------------------------------------- */

export function normalizeLicense(json, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors = [];
  const warnings = [];

  const check = (fn) => {
    try {
      return fn();
    } catch (e) {
      errors.push(e.message);
      return undefined;
    }
  };

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new GenerationError(['The input must be a JSON object']);
  }

  const decimals = UNIT_DECIMALS[opts.amountUnit];
  if (decimals === undefined) errors.push(`Unknown amount unit "${opts.amountUnit}"`);
  if (!IDENT_RE.test(String(opts.contractName))) errors.push(`"${opts.contractName}" is not a valid Solidity contract name`);
  if (!['4', '5'].includes(String(opts.ozVersion))) errors.push(`Unknown OpenZeppelin version "${opts.ozVersion}"`);
  if (!['marginal', 'cliff'].includes(opts.stepMode)) errors.push(`Unknown step mode "${opts.stepMode}"`);

  const input = readInput(json, opts.versionNumber, errors);
  const data = input?.data ?? {};
  const parties = input?.parties ?? {};

  const licenseId = input?.licenseId ?? json.licenseId;
  if (blank(licenseId)) errors.push('Missing "licenseId"');
  const licensor = check(() => toChecksumAddress(parties.licensor, 'licensor'));
  const licensee = check(() => toChecksumAddress(parties.licensee, 'licensee'));
  const duration = check(() => parseDuration(data.duration, 'duration'));

  if (!Array.isArray(data.rules)) {
    if (input) errors.push('"rules" must be an array');
  } else if (data.rules.length === 0) {
    warnings.push('The license has no rules: payRoyalty() will always revert with "No royalty due".');
  }

  const usedIdents = new Set();
  const rules = (Array.isArray(data.rules) ? data.rules : []).map((rule, index) => {
    const label = `Rule #${index + 1} (${rule?.id ?? 'no id'})`;
    const id = String(rule?.id ?? `rule${index + 1}`);
    let ident = id.replace(/[^A-Za-z0-9_]/g, '_');
    if (usedIdents.has(ident)) ident = `${ident}_${index}`;
    usedIdents.add(ident);

    const startTs = check(() => toTimestamp(rule?.validityStart, false, `${label}.validityStart`));
    const endTs = check(() => toTimestamp(rule?.validityEnd, true, `${label}.validityEnd`));
    if (startTs !== undefined && endTs !== undefined && endTs <= startTs) {
      errors.push(`${label}: validityEnd must be after validityStart`);
    }
    const rawInterval = rule?.evaluationInterval;
    const interval = rawInterval && typeof rawInterval === 'object' ? rawInterval.duration : rawInterval;
    const intervalSec = check(() => parseDuration(interval, `${label}.evaluationInterval`));

    const plan = planRule(rule, index, { opts, decimals: decimals ?? 18, errors, warnings, ident });

    return {
      index,
      id,
      ident,
      name: rule?.name ?? id,
      startTs,
      endTs,
      intervalSec,
      type: plan.type,
      plan,
    };
  });

  if (errors.length) throw new GenerationError(errors);

  return {
    options: opts,
    licenseId: String(licenseId),
    name: input.name ?? licenseId,
    versionNumber: input.versionNumber,
    status: input.status ?? '',
    licensor,
    licensee,
    territory: parties.territory ?? '',
    ips: data.ips ?? '',
    durationStr: String(data.duration),
    duration,
    rules,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/*  Model -> Solidity                                                          */
/* -------------------------------------------------------------------------- */

/** Block of payRoyalty() that settles one rule. */
function renderRuleBlock(rule) {
  const { plan } = rule;
  const L = [];
  const kind = plan.unsupported ? 'unsupported' : rule.type;
  L.push(`        // ---- Rule ${rule.index}: ${comment(rule.name)} (${comment(rule.id)}) - ${kind}`);
  L.push(`        //      valid ${isoDate(rule.startTs)} -> ${isoDate(rule.endTs)}, evaluated every ${rule.intervalSec / DAY} day(s)`);

  if (plan.unsupported) {
    L.push('        // TODO: unsupported royalty rate type, implement the calculation here.');
    L.push('        // The rule currently contributes 0 to totalDue.');
    L.push('');
    return L;
  }

  const rbs = [...plan.reads.entries()].sort((a, b) => a[0] - b[0]);
  rbs.forEach(([i, o]) => {
    L.push(`        //      rb${i} = ${comment(o.displayName)}${o.intellectualProperty ? ` [${comment(o.intellectualProperty)}]` : ''}`);
  });

  const clamp = [];
  if (plan.min) clamp.push(`                if (amount < ${formatWei(plan.min)}) amount = ${formatWei(plan.min)};`);
  if (plan.max) clamp.push(`                if (amount > ${formatWei(plan.max)}) amount = ${formatWei(plan.max)};`);

  L.push('        {');
  if (plan.single) {
    L.push(`            if (_pendingPeriods(${rule.index}) > 0) {`);
    rbs.forEach(([i, o]) => {
      L.push(`                uint256 rb${i} = ${interfaceName(o.propertyName)}(${o.address}).${o.propertyName}();`);
    });
    L.push(`                uint256 amount = ${plan.amountExpr};`);
    clamp.forEach((c) => L.push(c));
    L.push(`                totalDue += _recordSettlement(${rule.index}, 1, amount);`);
    L.push('            }');
  } else {
    L.push(`            uint256 periods = _pendingPeriods(${rule.index});`);
    L.push('            if (periods > 0) {');
    L.push(`                uint256 amount = ${plan.amountExpr};`);
    clamp.forEach((c) => L.push(c));
    L.push(`                totalDue += _recordSettlement(${rule.index}, periods, periods * amount);`);
    L.push('            }');
  }
  L.push('        }');
  L.push('');
  return L;
}

const MATH_HELPERS = {
  wmul: [
    '    /// @dev Fixed-point (18 decimals) multiplication.',
    '    function _wmul(uint256 a, uint256 b) internal pure returns (uint256) {',
    '        return (a * b) / 1 ether;',
    '    }',
  ],
  wdiv: [
    '    /// @dev Fixed-point (18 decimals) division; dividing by zero yields 0.',
    '    function _wdiv(uint256 a, uint256 b) internal pure returns (uint256) {',
    '        return b == 0 ? 0 : (a * 1 ether) / b;',
    '    }',
  ],
  wsub: [
    '    /// @dev Saturating subtraction: never goes below zero.',
    '    function _wsub(uint256 a, uint256 b) internal pure returns (uint256) {',
    '        return a > b ? a - b : 0;',
    '    }',
  ],
  max: [
    '    function _max(uint256 a, uint256 b) internal pure returns (uint256) {',
    '        return a > b ? a : b;',
    '    }',
  ],
  min: [
    '    function _min(uint256 a, uint256 b) internal pure returns (uint256) {',
    '        return a < b ? a : b;',
    '    }',
  ],
};

export function renderSolidity(model) {
  const { options } = model;
  const v5 = String(options.ozVersion) === '5';
  const L = [];
  const w = (s = '') => L.push(s);

  w('// SPDX-License-Identifier: MIT');
  w(`pragma solidity ${v5 ? '^0.8.20' : '^0.8.0'};`);
  w();
  w('import "@openzeppelin/contracts/access/Ownable.sol";');
  w(`import "@openzeppelin/contracts/${v5 ? 'utils' : 'security'}/ReentrancyGuard.sol";`);
  w();
  w(`// Generated from license ${comment(model.licenseId)} (version ${model.versionNumber}${model.status ? `, status: ${comment(model.status)}` : ''})`);
  w(`// ${comment(model.name)}`);
  w('//');
  w('// Conventions used by the generator:');
  w('//  - 1Y = 365 days, 1M = 30 days; rule validity ends at 23:59:59 UTC of validityEnd.');
  w(`//  - Monetary values of the JSON are read in "${options.amountUnit}"; rates are an amount per unit of the royalty base.`);
  w('//  - Oracles are expected to return the usage of the evaluation period being settled.');
  w('//  - Rules that read oracles (or use the time axis) settle ONE period per payRoyalty() call;');
  w('//    rules with a fixed amount accrue every period and can be paid in arrears.');
  w('//  - Custom rates are evaluated in 18-decimal fixed point (constants in currency units, royalty bases as plain numbers).');
  const unsupported = model.rules.filter((r) => r.plan.unsupported);
  if (unsupported.length) {
    w('//');
    w(`// WARNING: unsupported rate type in rule(s): ${unsupported.map((r) => r.id).join(', ')} (see TODO below).`);
  }
  w();

  // Oracle interfaces
  const ifaces = new Map();
  model.rules.forEach((r) => r.plan.reads.forEach((o) => ifaces.set(o.propertyName, interfaceName(o.propertyName))));
  if (ifaces.size) {
    w('// ---------------------------------------------------------------------------');
    w('// Oracle interfaces');
    w('// ---------------------------------------------------------------------------');
    for (const [prop, name] of ifaces) {
      w(`interface ${name} {`);
      w(`    function ${prop}() external view returns (uint256);`);
      w('}');
      w();
    }
  }

  w(`contract ${options.contractName} is Ownable, ReentrancyGuard {`);
  w('    struct LicenseInfo {');
  w('        string licenseId;');
  w('        string title;');
  w('        address licensor;');
  w('        address licensee;');
  w('        string intellectualProperty;');
  w('        string territory;');
  w('        uint256 duration;');
  w('        uint256 createdAt;');
  w('        uint256 activatedAt;');
  w('        bool isActive;');
  w('    }');
  w();
  w('    struct Rule {');
  w('        string id;');
  w('        string name;');
  w('        uint256 validityStart;');
  w('        uint256 validityEnd;');
  w('        uint256 evaluationInterval;');
  w('        uint256 periodsSettled;');
  w('    }');
  w();
  w('    LicenseInfo public licenseInfo;');
  w('    Rule[] public rules;');
  w();
  w('    event LicenseCreated(string licenseId, address indexed licensor, address indexed licensee);');
  w('    event LicenseActivated(address indexed licensee, uint256 activatedAt);');
  w('    event RuleSettled(string ruleId, uint256 periods, uint256 amount);');
  w('    event RoyaltyPaid(address indexed payer, uint256 amount, uint256 timestamp);');
  w();
  w(`    constructor()${v5 ? ' Ownable(msg.sender)' : ''} {`);
  w('        licenseInfo = LicenseInfo({');
  w(`            licenseId: ${solString(model.licenseId)},`);
  w(`            title: ${solString(model.name)},`);
  w(`            licensor: ${model.licensor},`);
  w(`            licensee: ${model.licensee},`);
  w(`            intellectualProperty: ${solString(model.ips)},`);
  w(`            territory: ${solString(model.territory)},`);
  w(`            duration: ${model.duration}, // ${comment(model.durationStr)}`);
  w('            createdAt: block.timestamp,');
  w('            activatedAt: 0,');
  w('            isActive: false');
  w('        });');
  w();
  model.rules.forEach((r) => {
    w('        rules.push(Rule({');
    w(`            id: ${solString(r.id)},`);
    w(`            name: ${solString(r.name)},`);
    w(`            validityStart: ${r.startTs}, // ${isoDate(r.startTs)}`);
    w(`            validityEnd: ${r.endTs}, // ${isoDate(r.endTs)} 23:59:59 UTC`);
    w(`            evaluationInterval: ${r.intervalSec}, // ${r.intervalSec / DAY} day(s)`);
    w('            periodsSettled: 0');
    w('        }));');
  });
  if (model.rules.length) w();
  w('        emit LicenseCreated(licenseInfo.licenseId, licenseInfo.licensor, licenseInfo.licensee);');
  w('    }');
  w();
  w('    // -----------------------------------------------------------------------');
  w('    // License lifecycle');
  w('    // -----------------------------------------------------------------------');
  w();
  w('    function activateLicense() external onlyOwner {');
  w('        require(licenseInfo.licensee != address(0), "Invalid licensee address");');
  w('        require(licenseInfo.activatedAt == 0, "License already activated");');
  w('        licenseInfo.isActive = true;');
  w('        licenseInfo.activatedAt = block.timestamp;');
  w('        emit LicenseActivated(licenseInfo.licensee, block.timestamp);');
  w('    }');
  w();
  w('    function pauseLicense() external onlyOwner {');
  w('        licenseInfo.isActive = false;');
  w('    }');
  w();
  w('    function resumeLicense() external onlyOwner {');
  w('        require(licenseInfo.activatedAt != 0, "License never activated");');
  w('        licenseInfo.isActive = true;');
  w('    }');
  w();
  w('    // -----------------------------------------------------------------------');
  w('    // Royalty payment (the only part that changes from license to license)');
  w('    // -----------------------------------------------------------------------');
  w();
  w('    /// @notice Settles every royalty rule that is due and forwards the amount to the licensor.');
  w('    ///         Any amount sent in excess of what is due is refunded to the caller.');
  w('    function payRoyalty() external payable nonReentrant {');
  w('        require(msg.sender == licenseInfo.licensee, "Only the licensee can pay");');
  w('        require(licenseInfo.isActive, "License not active");');
  w();
  w('        uint256 totalDue = 0;');
  w();
  model.rules.forEach((r) => renderRuleBlock(r).forEach((l) => w(l)));
  w('        require(totalDue > 0, "No royalty due");');
  w('        require(msg.value >= totalDue, "Insufficient payment");');
  w();
  w('        (bool sent, ) = payable(licenseInfo.licensor).call{value: totalDue}("");');
  w('        require(sent, "Transfer to licensor failed");');
  w();
  w('        if (msg.value > totalDue) {');
  w('            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalDue}("");');
  w('            require(refunded, "Refund failed");');
  w('        }');
  w();
  w('        emit RoyaltyPaid(msg.sender, totalDue, block.timestamp);');
  w('    }');

  // Per-rule helper functions (bracket lookups / step royalties)
  model.rules
    .filter((r) => r.plan.helpers.length)
    .forEach((r) => {
      w();
      w(`    /// @dev Helper of rule "${comment(r.id)}"${r.type === 'step' ? ` (${options.stepMode === 'marginal' ? 'marginal brackets' : 'whole usage at the matching bracket rate'})` : ''}.`);
      r.plan.helpers.forEach((l) => w(l));
    });

  w();
  w('    // -----------------------------------------------------------------------');
  w('    // Internal helpers');
  w('    // -----------------------------------------------------------------------');
  w();
  w('    /// @dev Number of completed evaluation periods of a rule that were not settled yet.');
  w('    function _pendingPeriods(uint256 index) internal view returns (uint256) {');
  w('        Rule storage rule = rules[index];');
  w('        if (block.timestamp <= rule.validityStart) return 0;');
  w();
  w('        uint256 t = block.timestamp < rule.validityEnd ? block.timestamp : rule.validityEnd;');
  w('        uint256 elapsed = t - rule.validityStart;');
  w('        uint256 completed = elapsed / rule.evaluationInterval;');
  w('        // After the end of validity the last (partial) period is billed as well.');
  w('        if (block.timestamp >= rule.validityEnd && elapsed % rule.evaluationInterval != 0) {');
  w('            completed += 1;');
  w('        }');
  w('        return completed > rule.periodsSettled ? completed - rule.periodsSettled : 0;');
  w('    }');
  w();
  w('    function _recordSettlement(uint256 index, uint256 periods, uint256 amount) internal returns (uint256) {');
  w('        rules[index].periodsSettled += periods;');
  w('        emit RuleSettled(rules[index].id, periods, amount);');
  w('        return amount;');
  w('    }');

  if (model.rules.some((r) => r.plan.usesTime)) {
    w();
    w('    /// @dev Days elapsed from validityStart to the end of the period that is being settled.');
    w('    function _timeAxisDays(uint256 index) internal view returns (uint256) {');
    w('        Rule storage rule = rules[index];');
    w('        return ((rule.periodsSettled + 1) * rule.evaluationInterval) / 1 days;');
    w('    }');
  }

  const needed = new Set();
  model.rules.forEach((r) => r.plan.mathHelpers.forEach((h) => needed.add(h)));
  ['wmul', 'wdiv', 'wsub', 'max', 'min'].filter((h) => needed.has(h)).forEach((h) => {
    w();
    MATH_HELPERS[h].forEach((l) => w(l));
  });

  w();
  w('    // -----------------------------------------------------------------------');
  w('    // Views');
  w('    // -----------------------------------------------------------------------');
  w();
  w('    function getLicenseInfo() external view returns (LicenseInfo memory) {');
  w('        return licenseInfo;');
  w('    }');
  w();
  w('    function rulesCount() external view returns (uint256) {');
  w('        return rules.length;');
  w('    }');
  w();
  w('    /// @notice Completed evaluation periods of a rule still waiting to be settled.');
  w('    function pendingPeriods(uint256 ruleIndex) external view returns (uint256) {');
  w('        return _pendingPeriods(ruleIndex);');
  w('    }');
  w();
  w('    function isLicenseValid() external view returns (bool) {');
  w('        return licenseInfo.isActive && block.timestamp < licenseInfo.activatedAt + licenseInfo.duration;');
  w('    }');
  w('}');
  w();

  return L.join('\n');
}

/** Main entry point: JSON object -> { code, model, warnings } (throws GenerationError). */
export function generateContract(json, options = {}) {
  const model = normalizeLicense(json, options);
  const code = renderSolidity(model);
  return { code, model, warnings: model.warnings };
}
