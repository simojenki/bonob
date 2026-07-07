import { extractXsdFromWsdl } from '../src/xml_utils';

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

describe('extractXsdFromWsdl', () => {
  it('returns an ok Result containing the serialized XSD schema element when present', () => {
    const result = extractXsdFromWsdl(WSDL_WITH_SCHEMA);
    expect(result.isOk()).toBe(true);
    result.map(xsd => {
      expect(xsd).toContain('getMetadata');
      expect(xsd).toContain('http://www.w3.org/2001/XMLSchema');
    });
  });

  it('returns an err Result when the WSDL contains no XSD schema', () => {
    expect(extractXsdFromWsdl(WSDL_WITHOUT_SCHEMA).isErr()).toBe(true);
  });

  it('returns an err Result for an empty WSDL', () => {
    expect(extractXsdFromWsdl('<definitions/>').isErr()).toBe(true);
  });
});
