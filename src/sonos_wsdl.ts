import { readFileSync } from 'fs';
import path from 'path';
import { XMLSerializer } from '@xmldom/xmldom';
import { select, select1 } from 'xpath';
import { validateXML } from 'xmllint-wasm';
import { extractXsdFromWsdl, parseXml } from './xml_utils';
import { err, ok, ResultAsync } from 'neverthrow';

export type SmapiValidationEvent =
  | { type: 'invalidSmapiMessage'; messages: string; body: string }
  | { type: 'error'; error: Error; body: string };

export type SmapiValidationHandler = (event: SmapiValidationEvent) => void;

export const SONOS_SERVICES_NAMESPACE = 'http://www.sonos.com/Services/1.1';
export const SOAP_ENVELOPE_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/';

// The standard, unmodified SOAP 1.1 envelope schema (https://schemas.xmlsoap.org/soap/envelope/).
// Sonos doesn't define Envelope/Body/Fault - this is the actual external spec that does, used
// to validate the parts of a fault response that are governed by the SOAP protocol itself
// rather than by the Sonos WSDL.
export const SOAP_ENVELOPE_XSD_FILE = path.resolve(__dirname, 'soap-envelope-1.1.xsd');
const SOAP_ENVELOPE_XSD = readFileSync(SOAP_ENVELOPE_XSD_FILE, 'utf8');

async function xsdValidate(xml: string, xsd: string): Promise<string[]> {
  const result = await validateXML({
    xml: [{ fileName: 'message.xml', contents: xml }],
    schema: [{ fileName: 'schema.xsd', contents: xsd }],
  });
  return result.valid ? [] : result.errors.map(e => e.message);
}

export class SonosWSDL {
  public readonly wsdl: string;
  public readonly xsd: string;

  constructor(wsdl: string) {
    this.wsdl = wsdl;
    this.xsd = extractXsdFromWsdl(wsdl)._unsafeUnwrap();
  }

  private async validateFault(fault: Node): Promise<string[]> {
    const envelopeErrors = await xsdValidate(new XMLSerializer().serializeToString(fault as any), SOAP_ENVELOPE_XSD);

    const detailChildren = select('*[local-name()="detail"]/*', fault as any) as Node[];
    if (detailChildren.length === 0) return envelopeErrors;

    // Sonos's docs show detail's children (SonosError/ExceptionInfo, refreshAuthTokenResult) inline,
    // with no wrapper - that's the wire format smapi.ts emits. But customFault is the only global
    // element the WSDL declares for that content, so it's the only thing we can hand to an XSD
    // validator as a root. Wrapping here is validation-only scaffolding, not part of the wire format.
    const inner = detailChildren.map(n => new XMLSerializer().serializeToString(n as any)).join('');
    const wrapped = `<tns:customFault xmlns:tns="${SONOS_SERVICES_NAMESPACE}">${inner}</tns:customFault>`;
    const sonosErrors = await xsdValidate(wrapped, this.xsd);

    return [...envelopeErrors, ...sonosErrors];
  }

  async validateSmapiMessage(body: string, handler: SmapiValidationHandler): Promise<void> {
    await parseXml(body)
      .map(doc => select1('/*[local-name()="Envelope"]/*[local-name()="Body"]/*[1]', doc as any) as (Node & Element) | null)
      .andThen(smapiMessage => smapiMessage
        ? ok(smapiMessage)
        : err(new Error('No SMAPI message found in SOAP Body')))
      .asyncAndThen(smapiMessage => ResultAsync.fromPromise(
        smapiMessage.namespaceURI === SOAP_ENVELOPE_NAMESPACE && smapiMessage.localName === 'Fault'
          ? this.validateFault(smapiMessage)
          : xsdValidate(new XMLSerializer().serializeToString(smapiMessage as any), this.xsd),
        (e) => e instanceof Error ? e : new Error(String(e))
      ))
      .match(
        messages => {
          if (messages.length > 0) {
            handler({ type: 'invalidSmapiMessage', messages: messages.join('; '), body });
          }
        },
        (e) => handler({ type: 'error', error: e, body })
      );
  }
}
