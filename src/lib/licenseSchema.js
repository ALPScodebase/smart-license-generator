/*
 * Conversion between the wizard's form model and the license JSON.
 *
 * The JSON written by the wizard uses the "canonical" layout (licenseId, parties, versions[]...), the same
 * produced by the license management system. Both the canonical layout and the older flat layout
 * ({ name, licensor, licensee, ..., rules }) can be loaded back into the wizard.
 */

const str = (v) => (v === undefined || v === null ? '' : String(v));
let seq = 0;
const newId = () => Date.now() * 1000 + (seq++ % 1000);

export function emptyLicense() {
  return {
    name: '',
    licensor: '',
    licensee: '',
    territory: '',
    duration: '',
    ips: '',
    rules: [],
  };
}

/* ------------------------------ JSON -> wizard ------------------------------ */

const ensureInputs = (inputs) =>
  (Array.isArray(inputs) ? inputs : []).map((n) => ({
    id: n?.id ?? newId(),
    type: n?.type ?? 'constant',
    value: str(n?.value),
    func: n?.func ?? 'sum',
    rb: str(n?.rb),
    inputs: ensureInputs(n?.inputs),
  }));

function toWizardRule(rule, index) {
  const rate = rule?.royaltyRate ?? {};
  const type = String(rate.type ?? 'lumpsum').toLowerCase();
  const interval = rule?.evaluationInterval;
  const sharedValue = str(rate.value);
  const structure = rate.stepStructure ?? {};
  return {
    id: rule?.id ?? newId(),
    name: str(rule?.name) || `Rule ${index + 1}`,
    validityStart: str(rule?.validityStart),
    validityEnd: str(rule?.validityEnd),
    evaluationInterval: { duration: interval && typeof interval === 'object' ? str(interval.duration) : str(interval) },
    royaltyBase: (Array.isArray(rule?.royaltyBase) ? rule.royaltyBase : []).map((rb) => ({
      id: rb?.id ?? newId(),
      oracleAddress: str(rb?.oracleAddress),
      propertyName: str(rb?.propertyName),
      displayName: str(rb?.displayName),
      intellectualProperty: str(rb?.intellectualProperty),
    })),
    royaltyRate: {
      type,
      lumpsumValue: str(rate.lumpsumValue) || (type === 'lumpsum' ? sharedValue : ''),
      proportionalValue: str(rate.proportionalValue) || (type === 'proportional' ? sharedValue : ''),
      proportionalRB: str(rate.proportionalRB),
      customFunc: rate.customFunc ?? 'sum',
      customInputs: ensureInputs(rate.customInputs),
      stepStructure: {
        xAxis: str(structure.xAxis),
        steps: (Array.isArray(structure.steps) ? structure.steps : []).map((s) => ({
          id: s?.id ?? newId(),
          threshold: s?.threshold ?? s?.x,
          rate: s?.rate ?? s?.y,
          description: str(s?.description),
        })),
        infiniteValue: str(structure.infiniteValue),
      },
      min: str(rate.min),
      max: str(rate.max),
    },
  };
}

/**
 * Loads a license JSON into the wizard model.
 * Returns { model, meta } where meta keeps what is needed to write the JSON back (id, previous versions...).
 */
export function fromJson(json, versionNumber = null) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('The JSON must be an object');

  let data;
  let parties;
  let name = json.name;
  const meta = { licenseId: json.licenseId ?? null, createdAt: json.createdAt ?? null, versions: [] };

  if (Array.isArray(json.versions) && json.versions.length) {
    const wanted = Number(versionNumber ?? json.currentVersion ?? json.versions[json.versions.length - 1].versionNumber);
    const version = json.versions.find((v) => Number(v.versionNumber) === wanted);
    if (!version) throw new Error(`Version ${wanted} not found`);
    data = version.data ?? {};
    parties = json.parties ?? {};
    meta.versions = json.versions;
  } else if (json.data && typeof json.data === 'object') {
    data = json.data;
    parties = json.parties ?? {};
  } else if (Array.isArray(json.rules)) {
    data = { duration: json.duration, ips: json.ips, rules: json.rules };
    parties = { licensor: json.licensor, licensee: json.licensee, territory: json.territory };
  } else {
    throw new Error('Unrecognised JSON: expected a license with "versions" or "rules"');
  }

  return {
    model: {
      name: str(name),
      licensor: str(parties.licensor),
      licensee: str(parties.licensee),
      territory: str(parties.territory),
      duration: str(data.duration),
      ips: str(data.ips),
      rules: (Array.isArray(data.rules) ? data.rules : []).map(toWizardRule),
    },
    meta,
  };
}

/* ------------------------------ wizard -> JSON ------------------------------ */

const num = (v) => {
  if (v === '' || v === undefined || v === null) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

function toCanonicalRule(rule) {
  const rate = rule.royaltyRate ?? {};
  const type = rate.type;
  const out = {
    type,
    ...(type === 'lumpsum' ? { value: str(rate.lumpsumValue) } : {}),
    ...(type === 'proportional' ? { value: str(rate.proportionalValue), proportionalRB: str(rate.proportionalRB) } : {}),
    ...(type === 'custom' ? { customFunc: rate.customFunc ?? 'sum' } : {}),
    customInputs: rate.customInputs ?? [],
    stepStructure: {
      xAxis: str(rate.stepStructure?.xAxis),
      steps: (rate.stepStructure?.steps ?? []).map((s) => ({
        id: s.id,
        threshold: num(s.threshold),
        rate: num(s.rate),
        description: s.description || `Step for ${s.threshold} → ${s.rate}`,
      })),
      infiniteValue: str(rate.stepStructure?.infiniteValue),
    },
    min: str(rate.min),
    max: str(rate.max),
  };
  return {
    id: rule.id,
    name: rule.name,
    validityStart: rule.validityStart,
    validityEnd: rule.validityEnd,
    evaluationInterval: rule.evaluationInterval?.duration ?? '',
    royaltyBase: (rule.royaltyBase ?? []).map((rb) => ({
      id: rb.id,
      oracleAddress: rb.oracleAddress,
      propertyName: rb.propertyName,
      displayName: rb.displayName,
      intellectualProperty: rb.intellectualProperty,
    })),
    royaltyRate: out,
  };
}

/** Wizard model -> canonical license JSON (an object, not a string). */
export function toCanonicalJson(model, meta = {}) {
  const now = new Date().toISOString();
  const previous = Array.isArray(meta.versions) ? meta.versions : [];
  const versionNumber = previous.length ? Math.max(...previous.map((v) => Number(v.versionNumber) || 0)) + 1 : 1;
  const licenseId = meta.licenseId || `LIC-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`;

  const version = {
    versionNumber,
    status: 'proposed',
    createdAt: now,
    createdBy: 'creator',
    comment: previous.length ? 'Edited with Smart License Generator' : 'Created with Smart License Generator',
    data: {
      duration: model.duration,
      ips: model.ips,
      rules: (model.rules ?? []).map(toCanonicalRule),
    },
    feedback: null,
    lastModified: now,
  };

  return {
    licenseId,
    name: model.name,
    currentVersion: versionNumber,
    status: 'proposed',
    createdAt: meta.createdAt || now,
    lastModified: now,
    parties: { licensor: model.licensor, licensee: model.licensee, territory: model.territory },
    versions: [...previous, version],
  };
}
