import { useMemo, useState } from 'react';
import { Button } from 'reactstrap';
import { highlightSolidity } from '../lib/highlight.js';
import { copyText, downloadText } from '../lib/files.js';

/** Code viewer with copy / download. `language` = 'solidity' | 'json'. */
export default function CodeBlock({ code, filename, language = 'solidity', mime = 'text/plain;charset=utf-8', extraActions }) {
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => (language === 'solidity' ? highlightSolidity(code) : null), [code, language]);

  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="codecard">
      <div className="codebar">
        <span className="filename">{filename}</span>
        <span className="grow" />
        {extraActions}
        <Button size="sm" color="light" onClick={onCopy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
        <Button size="sm" color="primary" onClick={() => downloadText(filename, code, mime)}>
          Download
        </Button>
      </div>
      <pre className="code">{html !== null ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}</pre>
    </div>
  );
}
