// Test helper: compiles generated Solidity with solc-js, resolving OpenZeppelin imports from node_modules.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const solc = require('solc');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function compile(source, ozVersion = '4', name = 'Generated.sol') {
  const ozDir = path.join(root, 'node_modules', ozVersion === '5' ? 'oz5' : 'oz4');
  const input = {
    language: 'Solidity',
    sources: { [name]: { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
  };
  const findImports = (p) => {
    const rel = p.replace(/^@openzeppelin\/contracts\//, '');
    const full = path.join(ozDir, rel);
    return fs.existsSync(full) ? { contents: fs.readFileSync(full, 'utf8') } : { error: `File not found: ${p}` };
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (out.errors ?? []).filter((e) => e.severity === 'error');
  const warnings = (out.errors ?? []).filter((e) => e.severity === 'warning');
  return { errors, warnings, contracts: out.contracts?.[name] ?? {} };
}
