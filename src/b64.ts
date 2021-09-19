export const b64Encode = (value: string) => Buffer.from(value).toString("base64");
export const b64Decode = (value: string) => Buffer.from(value, "base64").toString("ascii");