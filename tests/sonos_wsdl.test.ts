import { readFileSync } from 'fs';
import path from 'path';
import { SonosWSDL, SmapiValidationEvent, SmapiValidationHandler } from '../src/sonos_wsdl';

const WSDL_WITH_SCHEMA = `<?xml version="1.0"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
             xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <types>
    <xs:schema targetNamespace="http://example.com/"
               xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="getMetadata" type="xs:string"/>
    </xs:schema>
  </types>
</definitions>`;

const WSDL_WITHOUT_SCHEMA = `<?xml version="1.0"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/">
  <types/>
</definitions>`;

const SONOS_NS = 'http://www.sonos.com/Services/1.1';

const REAL_WSDL = readFileSync(
  path.resolve(__dirname, '../src/Sonoswsdl-1.19.6-20231024.wsdl'),
  'utf8'
);

// getMetadata's request per the real WSDL: id, index, count (recursive is optional).
const VALID_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <getMetadata xmlns="${SONOS_NS}">
      <id>root</id>
      <index>0</index>
      <count>100</count>
    </getMetadata>
  </s:Body>
</s:Envelope>`;

const UNKNOWN_OP_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <unknownOp xmlns="${SONOS_NS}"><id>root</id></unknownOp>
  </s:Body>
</s:Envelope>`;

const NO_BODY_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"></s:Envelope>`;

const FAULT_NO_DETAIL_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault>
      <faultcode>Client.LoginUnsupported</faultcode>
      <faultstring>Missing credentials...</faultstring>
    </s:Fault>
  </s:Body>
</s:Envelope>`;

const FAULT_WITH_VALID_DETAIL_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault xmlns:ns="${SONOS_NS}">
      <faultcode>Client.TokenRefreshRequired</faultcode>
      <faultstring>Token has expired</faultstring>
      <detail>
        <ns:refreshAuthTokenResult>
          <ns:authToken>NEW_TOKEN</ns:authToken>
          <ns:privateKey>REFRESH_TOKEN</ns:privateKey>
        </ns:refreshAuthTokenResult>
      </detail>
    </s:Fault>
  </s:Body>
</s:Envelope>`;

const FAULT_MISSING_FAULTSTRING_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault>
      <faultcode>Client.LoginUnsupported</faultcode>
    </s:Fault>
  </s:Body>
</s:Envelope>`;

const FAULT_WITH_WRONG_DETAIL_ORDER_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault xmlns:ns="${SONOS_NS}">
      <faultcode>Client.NOT_LINKED_RETRY</faultcode>
      <faultstring>Link Code not found yet</faultstring>
      <detail>
        <ns:ExceptionInfo>NOT_LINKED_RETRY</ns:ExceptionInfo>
        <ns:SonosError>5</ns:SonosError>
      </detail>
    </s:Fault>
  </s:Body>
</s:Envelope>`;

describe('SonosWSDL', () => {
  it('exposes the wsdl string passed to the constructor', () => {
    const wsdl = new SonosWSDL(WSDL_WITH_SCHEMA);
    expect(wsdl.wsdl).toBe(WSDL_WITH_SCHEMA);
  });

  it('extracts and exposes the xsd from the wsdl', () => {
    const wsdl = new SonosWSDL(WSDL_WITH_SCHEMA);
    expect(wsdl.xsd).toContain('getMetadata');
    expect(wsdl.xsd).toContain('http://www.w3.org/2001/XMLSchema');
  });

  it('throws when the wsdl contains no xsd schema', () => {
    expect(() => new SonosWSDL(WSDL_WITHOUT_SCHEMA)).toThrow();
  });

  describe('validateSmapiMessage', () => {
    let handler: jest.MockedFunction<SmapiValidationHandler>;
    let wsdl: SonosWSDL;

    beforeEach(() => {
      handler = jest.fn();
      wsdl = new SonosWSDL(REAL_WSDL);
    });

    it('does not call handler for a valid message', async () => {
      await wsdl.validateSmapiMessage(VALID_SOAP, handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('calls handler with invalidSmapiMessage event for an unknown operation', async () => {
      await wsdl.validateSmapiMessage(UNKNOWN_OP_SOAP, handler);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining<Partial<SmapiValidationEvent>>({
        type: 'invalidSmapiMessage',
        body: UNKNOWN_OP_SOAP,
      }));
    });

    it('calls handler with error event when there is no SMAPI message in the SOAP Body', async () => {
      await wsdl.validateSmapiMessage(NO_BODY_SOAP, handler);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining<Partial<SmapiValidationEvent>>({
        type: 'error',
      }));
    });

    it('calls handler with error event for malformed XML', async () => {
      await wsdl.validateSmapiMessage('<not valid xml <<', handler);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining<Partial<SmapiValidationEvent>>({
        type: 'error',
      }));
    });

    it('does not call handler for a fault with no detail', async () => {
      await wsdl.validateSmapiMessage(FAULT_NO_DETAIL_SOAP, handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not call handler for a fault with a valid, namespace-qualified detail', async () => {
      await wsdl.validateSmapiMessage(FAULT_WITH_VALID_DETAIL_SOAP, handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('calls handler with invalidSmapiMessage event for a fault missing the required faultstring (SOAP envelope schema violation)', async () => {
      await wsdl.validateSmapiMessage(FAULT_MISSING_FAULTSTRING_SOAP, handler);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining<Partial<SmapiValidationEvent>>({
        type: 'invalidSmapiMessage',
        body: FAULT_MISSING_FAULTSTRING_SOAP,
      }));
    });

    it('calls handler with invalidSmapiMessage event for a fault detail with elements in the wrong order (Sonos schema violation)', async () => {
      await wsdl.validateSmapiMessage(FAULT_WITH_WRONG_DETAIL_ORDER_SOAP, handler);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining<Partial<SmapiValidationEvent>>({
        type: 'invalidSmapiMessage',
        body: FAULT_WITH_WRONG_DETAIL_ORDER_SOAP,
      }));
    });
  });
});
