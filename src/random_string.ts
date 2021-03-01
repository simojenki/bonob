import { randomBytes } from "crypto";

const randomString = () => randomBytes(32).toString('hex')

export default randomString

