import { useMemo, useState } from 'react';
import { Container } from 'reactstrap';
import Stepper from './components/Stepper.jsx';
import StartScreen from './components/StartScreen.jsx';
import UploadScreen from './components/UploadScreen.jsx';
import StepConfiguration from './components/wizard/StepConfiguration.jsx';
import ReviewScreen from './components/ReviewScreen.jsx';
import SolidityScreen from './components/SolidityScreen.jsx';
import { emptyLicense, fromJson, toCanonicalJson } from './lib/licenseSchema.js';

const FLOWS = {
  create: { labels: ['Configure', 'Review & JSON', 'Solidity'], screens: ['configure', 'review', 'solidity'] },
  upload: { labels: ['Upload JSON', 'Solidity'], screens: ['upload', 'solidity'] },
};

export default function App() {
  const [screen, setScreen] = useState('start');
  const [flow, setFlow] = useState('create');

  // wizard state
  const [model, setModel] = useState(emptyLicense());
  const [meta, setMeta] = useState({});
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // upload state
  const [upload, setUpload] = useState({ text: '', name: '' });
  const [uploaded, setUploaded] = useState(null); // { json, versionNumber } being converted

  const wizardJson = useMemo(() => toCanonicalJson(model, meta), [model, meta]);

  const goCreate = () => {
    setModel(emptyLicense());
    setMeta({});
    setShowValidationErrors(false);
    setFlow('create');
    setScreen('configure');
  };

  const goUpload = () => {
    setFlow('upload');
    setScreen('upload');
  };

  const editInWizard = (json, versionNumber) => {
    const loaded = fromJson(json, versionNumber);
    setModel(loaded.model);
    setMeta(loaded.meta);
    setShowValidationErrors(false);
    setFlow('create');
    setScreen('configure');
  };

  const steps = FLOWS[flow];
  const current = screen === 'start' ? -1 : steps.screens.indexOf(screen);

  return (
    <>
      <header className="app-header">
        <Container>
          <div className="d-flex align-items-center gap-3 py-3">
            <button type="button" className="brand" onClick={() => setScreen('start')}>
              Smart License Generator
            </button>
            <span className="text-muted d-none d-md-inline">Build a license, get a Solidity contract.</span>
          </div>
        </Container>
      </header>

      <Container className="py-4">
        {screen !== 'start' && (
          <Stepper steps={steps.labels} current={current} onSelect={(i) => setScreen(steps.screens[i])} />
        )}

        {screen === 'start' && <StartScreen onCreate={goCreate} onUpload={goUpload} />}

        {screen === 'upload' && (
          <UploadScreen
            initialText={upload.text}
            initialName={upload.name}
            onTextChange={(text, name) => setUpload({ text, name })}
            onBack={() => setScreen('start')}
            onConvert={(json, versionNumber) => {
              setUploaded({ json, versionNumber });
              setScreen('solidity');
            }}
            onEdit={editInWizard}
          />
        )}

        {screen === 'configure' && (
          <StepConfiguration
            data={model}
            setData={setModel}
            showValidationErrors={showValidationErrors}
            setShowValidationErrors={setShowValidationErrors}
            onBack={() => setScreen('start')}
            onNext={() => setScreen('review')}
            nextLabel="Review & generate JSON"
          />
        )}

        {screen === 'review' && (
          <ReviewScreen json={wizardJson} onBack={() => setScreen('configure')} onConvert={() => setScreen('solidity')} />
        )}

        {screen === 'solidity' && flow === 'create' && (
          <SolidityScreen
            key="wizard"
            json={wizardJson}
            backLabel="Back to the JSON"
            onBack={() => setScreen('review')}
            onEdit={() => setScreen('configure')}
          />
        )}

        {screen === 'solidity' && flow === 'upload' && uploaded && (
          <SolidityScreen
            key={`upload-${uploaded.versionNumber}`}
            json={uploaded.json}
            versionNumber={uploaded.versionNumber}
            backLabel="Back to the upload"
            onBack={() => setScreen('upload')}
            onEdit={() => editInWizard(uploaded.json, uploaded.versionNumber)}
          />
        )}
      </Container>
    </>
  );
}
