import { useMemo } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Col, Row } from 'reactstrap';
import CodeBlock from './CodeBlock.jsx';
import { generateContract } from '../lib/generator.js';

/** Shows the JSON built by the wizard; the user can download it or continue to Solidity. */
export default function ReviewScreen({ json, onBack, onConvert }) {
  const text = useMemo(() => JSON.stringify(json, null, 2), [json]);
  const readiness = useMemo(() => {
    try {
      const { warnings } = generateContract(json);
      return { ok: true, warnings };
    } catch (e) {
      return { ok: false, errors: e.errors ?? [e.message] };
    }
  }, [json]);

  return (
    <Row className="g-4">
      <Col lg="4">
        <Card>
          <CardHeader>
            <CardTitle tag="h5" className="mb-0">
              Your license
            </CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="summary">
              <dt>ID</dt>
              <dd>{json.licenseId}</dd>
              <dt>Name</dt>
              <dd>{json.name}</dd>
              <dt>Territory</dt>
              <dd>{json.parties.territory}</dd>
              <dt>Rules</dt>
              <dd>{json.versions[json.versions.length - 1].data.rules.length}</dd>
              <dt>Version</dt>
              <dd>v{json.currentVersion}</dd>
            </dl>

            {readiness.ok ? (
              <Alert color="success" className="small">
                The JSON can be converted to Solidity.
                {readiness.warnings.length > 0 && ` (${readiness.warnings.length} note(s) to check in the next step)`}
              </Alert>
            ) : (
              <Alert color="warning" className="small">
                <strong>The JSON is complete, but it cannot be converted to Solidity yet:</strong>
                <ul className="mb-0 ps-3">
                  {readiness.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                <div className="mt-2">Go back to the editor to fix it, or download the JSON as it is.</div>
              </Alert>
            )}

            <div className="d-grid gap-2">
              <Button color="primary" onClick={onConvert}>
                Convert to Solidity →
              </Button>
              <Button color="secondary" outline onClick={onBack}>
                ← Back to the editor
              </Button>
            </div>
          </CardBody>
        </Card>
      </Col>
      <Col lg="8">
        <CodeBlock code={text} filename={`${json.licenseId}.json`} language="json" mime="application/json" />
      </Col>
    </Row>
  );
}
