import "server-only";
import type { SideQuestVerifier } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * VERIFICATION IS DELIBERATELY NOT WIRED YET.
 *
 * This map is empty. POST /api/sidequests/[id]/claim looks a quest up here;
 * finding nothing, it records the claim as "pending" and awards zero points.
 * So an unproven claim is harmless — nothing is given away automatically.
 *
 * To turn a quest on, add an entry. Everything else already works:
 *
 *   export const VERIFIERS: Record<string, SideQuestVerifier> = {
 *     "devnet-deploy": {
 *       kind: "onchain",
 *       async check(pubkey) {
 *         const conn = new Connection(process.env.RPC_URL!);
 *         const owner = new PublicKey(pubkey);
 *         const programs = await conn.getProgramAccounts(BPF_LOADER, {
 *           filters: [{ memcmp: { offset: 4, bytes: owner.toBase58() } }],
 *         });
 *         return programs.length > 0;
 *       },
 *     },
 *
 *     "hackathon-entry": {
 *       kind: "api",
 *       async check(pubkey) {
 *         // Colosseum has no public API for this today, so realistically
 *         // this one stays manual: a reviewer flips the claim to verified.
 *         return false;
 *       },
 *     },
 *
 *     "solana-school": {
 *       kind: "attestation",
 *       async check(pubkey) {
 *         // Cheapest honest option: ask the learner to sign a message with
 *         // the same wallet from a form you control, then match against the
 *         // Luma guest list export.
 *         return await inGuestList(pubkey);
 *       },
 *     },
 *   };
 *
 * Two of these are inherently manual. That is fine — a reviewer flipping a
 * claim to "verified" is a legitimate verifier, it just isn't code. Build
 * the admin queue before you build clever on-chain checks.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const VERIFIERS: Record<string, SideQuestVerifier> = {};

export function getVerifier(questId: string): SideQuestVerifier | null {
  return VERIFIERS[questId] ?? null;
}
