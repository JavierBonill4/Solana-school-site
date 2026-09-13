/**
 * Moved to lib/db.ts.
 *
 * Nonces used to live in an in-memory Map, which works on one process and
 * fails intermittently across serverless instances: the instance that issues
 * a nonce is rarely the one that verifies it, so sign-in succeeds or fails
 * depending on which container answers.
 *
 * This file is a re-export so nothing breaks on the way past. Import from
 * "@/lib/db" directly and delete it.
 */
export { issueNonce, consumeNonce } from "./db";
