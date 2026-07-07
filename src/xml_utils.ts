import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { Result, ok, err } from 'neverthrow';

const SILENT_ERROR_HANDLER = (level: 'error' | 'warning' | 'fatalError', msg: string) => {
  if (level === 'fatalError') throw new Error(msg);
};

export function parseXml(xml: string): Result<ReturnType<DOMParser['parseFromString']>, Error> {
  try {
    return ok(new DOMParser({ errorHandler: SILENT_ERROR_HANDLER }).parseFromString(xml, 'text/xml'));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function extractXsdFromWsdl(wsdlContent: string): Result<string, Error> {
  const doc = new DOMParser().parseFromString(wsdlContent, 'text/xml');
  const schemaEl = doc.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'schema').item(0);
  return schemaEl
    ? ok(new XMLSerializer().serializeToString(schemaEl as any))
    : err(new Error('No xsd found in wsdl'));
}
