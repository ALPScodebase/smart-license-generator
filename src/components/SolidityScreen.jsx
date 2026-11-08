import { useMemo, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Label, Row } from 'reactstrap';
import CodeBlock from './CodeBlock.jsx';
import { DEFAULT_OPTIONS, GenerationError, defaultVersion, generateContract, listVersions } from '../lib/generator.js';
import { downloadText } from '../lib/files.js';

/** Converts a license JSON to Solidity and shows / downloads the result. */
export default function SolidityScreen({ json, versionNumber = null, backLabel, onBack, onEdit }) {
  const [options, setOptions] = useState({ ...DEFAULT_OPTIONS, versionNumber });
  const setOption = (k, v) => setOptions((o) => ({ ...o, [k]: v }));

  const versions = listVersions(json);
  const activeVersion = options.versionNumber ?? defaultVersion(json);

  const result = useMemo(() => {
    try {
      return { ok: true, ...generateContract(json, options) };
    } catch (e) {
      return { ok: false, errors: e instanceof GenerationError ? e.errors : [e.message] };
    }
  }, [json, options]);

  const jsonName = `${json.licenseId ?? 'license'}.json`;

  return (
    <Row className="g-4">
      <Col lg="4">
        <Card>
          <CardHeader>
            <CardTitle tag="h5" className="mb-0">
              Contract options
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="mb-3">
              <Label className="small text-muted" for="contractName">
                Contract name
              </Label>
              <Input id="contractName" value={options.contractName} spellCheck={false} onChange={(e) => setOption('contractName', e.target.value)} />
            </div>
            {versions.length > 1 && (
              <div className="mb-3">
                <Label className="small text-muted" for="solVersion">
                  License version
                </Label>
                <Input id="solVersion" type="select" value={activeVersion} onChange={(e) => setOption('versionNumber', Number(e.target.value))}>
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      v{v}
                      {v === json.currentVersion ? ' (current)' : ''}
                    </option>
                  ))}
                </Input>
              </div>
            )}
            <div className="mb-3">
              <Label className="small text-muted" for="ozVersion">
                OpenZeppelin Contracts
              </Label>
              <Input id="ozVersion" type="select" value={options.ozVersion} onChange={(e) => setOption('ozVersion', e.target.value)}>
                <option value="4">v4.x (Solidity ^0.8.0)</option>
                <option value="5">v5.x (Solidity ^0.8.20)</option>
              </Input>
            </div>
            <div className="mb-3">
              <Label className="small text-muted" for="unit">
                Amounts in the license are in
              </Label>
              <Input id="unit" type="select" value={options.amountUnit} onChange={(e) => setOption('amountUnit', e.target.value)}>
                <option value="ether">ether</option>
                <option value="gwei">gwei</option>
                <option value="wei">wei</option>
              </Input>
            </div>
            <div className="mb-3">
              <Label className="small text-muted" for="stepMode">
                "Step" rates
              </Label>
              <Input id="stepMode" type="select" value={options.stepMode} onChange={(e) => setOption('stepMode', e.target.value)}>
                <option value="marginal">Marginal (each bracket at its own rate)</option>
                <option value="cliff">Cliff (all usage at the matching rate)</option>
              </Input>
            </div>
            <p className="small text-muted mb-4">
              Rates are read as an amount per unit of the royalty base (e.g. 0.02 ether per km), not as a percentage.
            </p>

            <div className="d-grid gap-2">
              {onEdit && (
                <Button color="primary" outline onClick={onEdit}>
                  Edit in wizard
                </Button>
              )}
              <Button color="secondary" outline onClick={() => downloadText(jsonName, JSON.stringify(json, null, 2), 'application/json')}>
                Download license JSON
              </Button>
              <Button color="link" onClick={onBack}>
                ← {backLabel}
              </Button>
            </div>
          </CardBody>
        </Card>
      </Col>

      <Col lg="8">
        {!result.ok && (
          <Alert color="danger">
            <strong>Cannot generate the contract:</strong>
            <ul className="mb-0 ps-3">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {onEdit && <div className="mt-2">Open the license in the wizard to fix these fields.</div>}
          </Alert>
        )}
        {result.ok && result.warnings.length > 0 && (
          <Alert color="warning">
            <strong>Check before deploying:</strong>
            <ul className="mb-0 ps-3">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}
        {result.ok && <CodeBlock code={result.code} filename={`${options.contractName}-${result.model.licenseId}.sol`} />}
      </Col>
    </Row>
  );
}
