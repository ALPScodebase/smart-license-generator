import { Button, Card, CardBody, Col, Row } from 'reactstrap';

export default function StartScreen({ onCreate, onUpload }) {
  return (
    <Row className="g-4 justify-content-center">
      <Col md="6" lg="5">
        <Card className="h-100 start-card">
          <CardBody className="d-flex flex-column">
            <h4>Build a new license</h4>
            <p className="text-muted flex-grow-1">
              Describe the license, its royalty bases (oracles) and rates with the guided form. You will get the license
              JSON, which you can download or convert to a Solidity contract.
            </p>
            <Button color="primary" onClick={onCreate}>
              Start the wizard
            </Button>
          </CardBody>
        </Card>
      </Col>
      <Col md="6" lg="5">
        <Card className="h-100 start-card">
          <CardBody className="d-flex flex-column">
            <h4>Upload an existing JSON</h4>
            <p className="text-muted flex-grow-1">
              Load a license JSON created earlier and convert it straight to Solidity, or open it in the wizard to edit it
              first.
            </p>
            <Button color="primary" outline onClick={onUpload}>
              Upload JSON
            </Button>
          </CardBody>
        </Card>
      </Col>
    </Row>
  );
}
