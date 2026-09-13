/**
 * Sign In With Solana message. Plain text on purpose — wallets render it
 * legibly, so the person can read what they are signing instead of
 * approving a hex blob.
 *
 * Shared by client (builds it) and server (parses and checks it).
 */

export interface SiwsFields {
  domain: string;
  address: string;
  uri: string;
  nonce: string;
  issuedAt: string;
}

export const SIWS_STATEMENT =
  "Sign in to Solana Summer. This is a signature, not a transaction: it costs nothing and cannot move your funds.";

export function buildSiwsMessage(f: SiwsFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    "",
    SIWS_STATEMENT,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  ].join("\n");
}

export function parseSiwsMessage(message: string): SiwsFields | null {
  const lines = message.split("\n");
  if (lines.length < 9) return null;

  const domain = lines[0].replace(
    / wants you to sign in with your Solana account:$/,
    ""
  );
  if (domain === lines[0]) return null;

  const address = lines[1].trim();
  const get = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : null;
  };

  const uri = get("URI:");
  const nonce = get("Nonce:");
  const issuedAt = get("Issued At:");
  if (!address || !uri || !nonce || !issuedAt) return null;

  return { domain, address, uri, nonce, issuedAt };
}
