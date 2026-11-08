import { useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Label, Row } from 'reactstrap';
import { defaultVersion, listVersions } from '../lib/generator.js';
import { fromJson } from '../lib/licenseSchema.js';
import sampleJson from '../sample/smart-license.json?raw';

export default function UploadScreen({ initialText = '', initialName = '', onTextChange, onConvert, onEdit, onBack }) {
  const [text, setText] = useState(initialText);
  const [fileName, setFileName] = useState(initialName);
  const [dragging, setDragging] = useState(false);
  const [version, setVersion] = useState(null);
  const fileInput = useRef(null);

  const load = (value, name = '') => {
    setText(value);
    setFileName(name);
    setVersion(null);
    onTextChange?.(value, name);
  };

  const readFile = async (file) => {
    if (file) load(await file.text(), file.name);
  };

  const parsed = useMemo(() => {
    if (!text.trim()) return { json: null, error: null };
    try {
      return { json: JSON.parse(text), error: null };
    } catch (e) {
      return { json: null, error: `Invalid JSON: ${e.message}` };
    }
  }, [text]);

  const summary = useMemo(() => {
    if (!parsed.json) return null;
    try {
      const v = version ?? defaultVersion(parsed.json);
      return { ok: true, ...fromJson(parsed.json, v), versionNumber: v };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [parsed.json, version]);

  const versions = listVersions(parsed.json);
  const activeVersion = version ?? defaultVersion(parsed.json);

  return (
    <Row className="g-4">
      <Col lg="6">
        <Card>
          <CardHeader>
            <CardTitle tag="h5" className="mb-0">
              Upload a license JSON
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div
              className={`dropzone${dragging ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                readFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  readFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <strong>{fileName || 'Drop a .json file here'}</strong>
              <span className="text-muted small">{fileName ? 'click to choose another' : 'or click to browse'}</span>
            </div>
            <Label className="mt-3 small text-muted" for="jsonPaste">
              …or paste the JSON
            </Label>
            <Input
              id="jsonPaste"
              type="textarea"
              rows="9"
              spellCheck={false}
              className="font-monospace small"
              value={text}
              onChange={(e) => load(e.target.value)}
            />
            <div className="mt-3 d-flex gap-2">
              <Button size="sm" color="secondary" outline onClick={() => load(sampleJson, 'smart-license-sample.json')}>
                Load sample
              </Button>
              {text && (
                <Button size="sm" color="secondary" outline onClick={() => load('')}>
                  Clear
                </Button>
              )}
              <span className="flex-grow-1" />
              <Button size="sm" color="link" onClick={onBack}>
                ← Back
              </Button>
            </div>
          </CardBody>
        </Card>
      </Col>

      <Col lg="6">
        {parsed.error && <Alert color="danger">{parsed.error}</Alert>}
        {summary && !summary.ok && <Alert color="danger">{summary.error}</Alert>}
        {!text.trim() && (
          <div className="empty">Load a license JSON to see its summary and convert it to Solidity.</div>
        )}

        {summary?.ok && (
          <Card>
            <CardHeader>
              <CardTitle tag="h5" className="mb-0">
                {summary.model.name || 'Untitled license'}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="summary">
                <dt>License ID</dt>
                <dd>{summary.meta.licenseId || '—'}</dd>
                <dt>Licensor</dt>
                <dd className="text-break">{summary.model.licensor || '—'}</dd>
                <dt>Licensee</dt>
                <dd className="text-break">{summary.model.licensee || '—'}</dd>
                <dt>Territory</dt>
                <dd>{summary.model.territory || '—'}</dd>
                <dt>Duration</dt>
                <dd>{summary.model.duration || '—'}</dd>
              </dl>

              {versions.length > 1 && (
                <div className="mb-3">
                  <Label className="small text-muted" for="versionSelect">
                    License version
                  </Label>
                  <Input id="versionSelect" type="select" value={activeVersion} onChange={(e) => setVersion(Number(e.target.value))}>
                    {versions.map((v) => (
                      <option key={v} value={v}>
                        v{v}
                        {v === parsed.json?.currentVersion ? ' (current)' : ''}
                      </option>
                    ))}
                  </Input>
                </div>
              )}

              <div className="small text-muted mb-1">Rules ({summary.model.rules.length})</div>
              <ul className="rules">
                {summary.model.rules.map((r) => (
                  <li key={r.id}>
                    <span>{r.name}</span>
                    <Badge color="light" className="text-dark border">
                      {r.royaltyRate.type}
                    </Badge>
                  </li>
                ))}
              </ul>

              <div className="d-flex gap-2 mt-4 flex-wrap">
                <Button color="primary" onClick={() => onConvert(parsed.json, activeVersion)}>
                  Convert to Solidity →
                </Button>
                <Button color="primary" outline onClick={() => onEdit(parsed.json, activeVersion)}>
                  Edit in wizard
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </Col>
    </Row>
  );
}
