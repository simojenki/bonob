import { SonosWSDL } from '../src/sonos_wsdl';

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

// Minimal XSD with a single known element "getMetadata"
const TEST_XSD = `<xs:schema targetNamespace="http://test.example/"
             xmlns:xs="http://www.w3.org/2001/XMLSchema"
             elementFormDefault="qualified">
  <xs:element name="getMetadata">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="id" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

const WSDL_WITH_TEST_SCHEMA = `<?xml version="1.0"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
             xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <types>${TEST_XSD}</types>
</definitions>`;

const VALID_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <getMetadata xmlns="http://test.example/">
      <id>root</id>
    </getMetadata>
  </s:Body>
</s:Envelope>`;

const UNKNOWN_OP_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <unknownOp xmlns="http://test.example/"><id>root</id></unknownOp>
  </s:Body>
</s:Envelope>`;

const NO_BODY_SOAP = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"></s:Envelope>`;

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
    let log: { warn: jest.Mock; error: jest.Mock };
    let wsdl: SonosWSDL;

    beforeEach(() => {
      log = { warn: jest.fn(), error: jest.fn() };
      wsdl = new SonosWSDL(WSDL_WITH_TEST_SCHEMA);
    });

    it('does not warn for a valid message', async () => {
      await wsdl.validateSmapiMessage(VALID_SOAP, log as any);
      expect(log.warn).not.toHaveBeenCalled();
    });

    it('warns for an unknown operation', async () => {
      await wsdl.validateSmapiMessage(UNKNOWN_OP_SOAP, log as any);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('validation failed'));
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(UNKNOWN_OP_SOAP));
    });

    it('errors when there is no SMAPI message in the SOAP Body', async () => {
      await wsdl.validateSmapiMessage(NO_BODY_SOAP, log as any);
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('validation error'));
      expect(log.warn).not.toHaveBeenCalled();
    });

    it('errors for malformed XML', async () => {
      await wsdl.validateSmapiMessage('<not valid xml <<', log as any);
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('validation error'));
    });
  });
});
