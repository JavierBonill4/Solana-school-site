# Reference solution — Assignment 05, Transfer Hook

Admin only.

**Verified by execution, not by reading.** This exact tree was built with
`anchor build` (Anchor 1.2.0, platform-tools v1.55) and run with
`cargo test --workspace`: **7 tests, 7 passing, 0 failing**. The grading layer
in `challenge-layers/transfer-hook/` was then run against it and returned
**gates 4/4, exit 0**. The untouched starter returns **1/4** through the same
grader, which is the other half of the check — a grader that passes everything
proves nothing.

## What the four guide challenges actually ask for

| # | Challenge | Files | New tests |
|---|---|---|---|
| 1 | Validate the mint | `initialize.rs` | 0 |
| 2 | Store the mint | `state/rate_limit.rs`, `initialize.rs` | 0 |
| 3 | One limit per user | `initialize.rs`, `transfer_hook.rs`, `init_extra_account_meta.rs`, helpers | 1 |
| 4 | Transfer from a program | new `programs/token-mover`, helpers | 2 |

Four shipped tests plus three is the bar of **7** the grader enforces.

## How each challenge maps onto a gate

This is worth keeping straight, because the gates were chosen to line up with
the guide rather than the other way round.

- **`build`** — nothing special; it is the floor.
- **`surface`** — satisfied by **Challenge 2** alone. Adding `mint: Pubkey` to
  `RateLimit` is the one change that shows up in the IDL. Challenges 1 and 3
  change constraints and seeds, which the IDL does not describe.
- **`errors`** — satisfied by **Challenge 1**. The starter references
  `ErrorCode::` in exactly two places, both in `transfer_hook.rs`. Returning
  `InvalidMint` from `initialize` makes it three. This gate counts *uses*, not
  declarations, because the guide hands out the existing codes and their hex
  values and never asks for a new variant — "a new `#[error_code]` variant"
  would fail every correct solution.
- **`tests`** — needs **Challenges 3 and 4**, since those are where the three
  new tests come from.

So all four challenges are load-bearing. A learner who stops after Challenge 2
gets 3/4 and no points beyond the 20-point attempt credit.

## Challenge 1, 2 and 3 — the program

`created_at`-style byte-layout care is not needed here: `RateLimit` is only
ever read through Anchor, and `#[derive(InitSpace)]` recomputes the size, so
`space = ANCHOR_DISCRIMINATOR_SIZE + RateLimit::INIT_SPACE` needs no edit when
the field is added.

What *does* need care is that the rate-limit PDA is derived in **three**
places that must agree exactly — `initialize.rs` creates it, `transfer_hook.rs`
loads it, and `init_extra_account_meta.rs` tells Token-2022 how to resolve it.
Change two of the three and the failure is a seeds-constraint error at transfer
time, which does not point at the file that is wrong.

```diff
diff --git a/programs/solana-fall-transfer-hook/src/instructions/init_extra_account_meta.rs b/programs/solana-fall-transfer-hook/src/instructions/init_extra_account_meta.rs
index 2b2278e..3f85feb 100644
--- a/programs/solana-fall-transfer-hook/src/instructions/init_extra_account_meta.rs
+++ b/programs/solana-fall-transfer-hook/src/instructions/init_extra_account_meta.rs
@@ -26,19 +26,23 @@ pub struct InitializeExtraAccountMetaList<'info> {
 
 pub fn extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
     Ok(vec![
-        // A single, program-wide rate limit account derived only from the
-        // "rate_limit" literal seed. Every transfer of every mint by every
-        // owner resolves to this one account.
+        // Challenge 3: the rate limit account is now derived per mint and per
+        // owner, so the client cannot be told which account to pass — it has
+        // to be resolved from the transfer itself.
         //
-        // CHALLENGE: make the rate limit account deterministic *per mint and
-        // per owner* by adding the mint and owner as extra seeds.
+        // The indexes are positions in the Execute instruction's account list,
+        // which the transfer-hook interface fixes:
         //
-        // The seeds here must match the PDA seeds used to create the account
-        // in `initialize.rs` and to load it in `transfer_hook.rs` (and the
-        // test helpers), so all of them have to be updated together.
+        //   0 source, 1 mint, 2 destination, 3 owner, 4 this list
+        //
+        // so AccountKey { index: 1 } is the mint and { index: 3 } the owner.
+        // These must match the PDA seeds in `initialize.rs` and
+        // `transfer_hook.rs` exactly.
         ExtraAccountMeta::new_with_seeds(
             &[
                 Seed::Literal { bytes: b"rate_limit".to_vec() },
+                Seed::AccountKey { index: 1 },      // mint
+                Seed::AccountKey { index: 3 },      // owner of the source token account
             ],
             false,                                  // is signer
             true,                                   // is writable
diff --git a/programs/solana-fall-transfer-hook/src/instructions/initialize.rs b/programs/solana-fall-transfer-hook/src/instructions/initialize.rs
index 1cfc5a0..d752c77 100644
--- a/programs/solana-fall-transfer-hook/src/instructions/initialize.rs
+++ b/programs/solana-fall-transfer-hook/src/instructions/initialize.rs
@@ -7,12 +7,18 @@ use crate::{ANCHOR_DISCRIMINATOR_SIZE, RateLimit, error::ErrorCode};
 pub struct Initialize<'info> {
     #[account(mut)]
     pub payer: Signer<'info>,
+    // Challenge 1: the mint is now part of the context, so it can be checked
+    // and stored. `InterfaceAccount<Mint>` accepts either token program; the
+    // handler narrows that to Token-2022.
+    pub mint: InterfaceAccount<'info, Mint>,
     #[account(
         init,
         payer = payer,
-        // Unique, program-wide rate limit account. See the CHALLENGE note in
-        // `init_extra_account_meta.rs` for making this per-mint/per-owner.
-        seeds = [b"rate_limit"],
+        // Challenge 3: one bucket per (mint, owner) instead of one for the
+        // whole program. These seeds must stay in lockstep with the ones in
+        // `transfer_hook.rs` and with the ExtraAccountMeta seeds in
+        // `init_extra_account_meta.rs`.
+        seeds = [b"rate_limit", mint.key().as_ref(), payer.key().as_ref()],
         bump,
         space = ANCHOR_DISCRIMINATOR_SIZE + RateLimit::INIT_SPACE,
     )]
@@ -21,12 +27,23 @@ pub struct Initialize<'info> {
 }
 
 pub fn handler(ctx: Context<Initialize>) -> Result<()> {
-    // For the challenge - Ensure the mint is a token-2022 mint by checking its owner (Pass the mint in the context and check its owner. 
-    // Consider saving the mint in the RateLimit struct if needed for future use.
+    // Challenge 1: refuse anything that is not a Token-2022 mint.
+    //
+    // Anchor has already checked that this account deserializes as a mint
+    // owned by *a* token program. Only Token-2022 has the transfer-hook
+    // extension, so a classic SPL mint here would produce a rate limit that
+    // can never be enforced — the hook would simply never be called.
+    require_keys_eq!(
+        *ctx.accounts.mint.to_account_info().owner,
+        token_2022::ID,
+        ErrorCode::InvalidMint
+    );
 
     // Initialize the rate limit account with the authority, mint, max amount, and window start timestamp
     ctx.accounts.rate_limit.set_inner(RateLimit {
         authority: ctx.accounts.payer.key(),
+        // Challenge 2: remember which mint this bucket belongs to.
+        mint: ctx.accounts.mint.key(),
         max_amount: RateLimit::MAX_AMOUNT,
         window_start: Clock::get()?.unix_timestamp,
         amount_transferred: 0
diff --git a/programs/solana-fall-transfer-hook/src/instructions/transfer_hook.rs b/programs/solana-fall-transfer-hook/src/instructions/transfer_hook.rs
index 3f76868..8f3b18a 100644
--- a/programs/solana-fall-transfer-hook/src/instructions/transfer_hook.rs
+++ b/programs/solana-fall-transfer-hook/src/instructions/transfer_hook.rs
@@ -27,9 +27,12 @@ pub struct TransferHook<'info> {
     pub extra_account_meta_list: UncheckedAccount<'info>,
     #[account(
         mut,
-        // Unique, program-wide rate limit account. See the CHALLENGE note in
-        // `init_extra_account_meta.rs` for making this per-mint/per-owner.
-        seeds = [b"rate_limit"],
+        // Challenge 3: per mint, per owner. The same three seeds are used in
+        // `initialize.rs` and resolved by the ExtraAccountMeta in
+        // `init_extra_account_meta.rs` — all three have to agree or the
+        // account Token-2022 passes in will not be the one this constraint
+        // derives, and the transfer fails on a seeds mismatch.
+        seeds = [b"rate_limit", mint.key().as_ref(), owner.key().as_ref()],
         bump,
     )]
     pub rate_limit: Account<'info, RateLimit>,
diff --git a/programs/solana-fall-transfer-hook/src/state/rate_limit.rs b/programs/solana-fall-transfer-hook/src/state/rate_limit.rs
index 9ca92f9..c56347e 100644
--- a/programs/solana-fall-transfer-hook/src/state/rate_limit.rs
+++ b/programs/solana-fall-transfer-hook/src/state/rate_limit.rs
@@ -4,6 +4,7 @@ use anchor_lang::prelude::*;
 #[derive(InitSpace)]
 pub struct RateLimit {
     pub authority: Pubkey,          // The account that can update the rate limit
+    pub mint: Pubkey,               // The mint this rate limit applies to
     pub max_amount: u64,            // The maximum amount that can be transferred within one window
     pub window_start: i64,          // The timestamp at which the current window opened
     pub amount_transferred: u64,    // The total amount transferred within the current window
```

### The part that trips people up

`Seed::AccountKey { index }` indexes the **Execute** instruction's account
list, which the transfer-hook interface fixes as:

```
0  source token account
1  mint
2  destination token account
3  owner (authority of the source account)
4  the ExtraAccountMetaList itself
5+ the extra accounts being resolved
```

so the mint is `index: 1` and the owner is `index: 3`. These are not the
indexes of the accounts in *our* `TransferHook` context, and guessing from
that struct gives `index: 1` for the mint (right, by luck) and `index: 3` for
the owner (right, also by luck) — the two happen to line up here, which is why
a wrong mental model survives this assignment.

## Challenge 4 — the token-mover program

The interesting half of the assignment. A wallet-signed `transfer_checked`
carries the hook's extra accounts because the *client* resolved them by reading
the ExtraAccountMetaList. A CPI has no client, so the calling program has to
resolve them on-chain.

`spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi`
does that: give it the transfer instruction, the account infos, the hook
program id, the four transfer accounts and `remaining_accounts`, and it reads
the validation state, resolves every seed in it, and appends the resolved
accounts plus the list plus the hook program to both the instruction and the
infos. The caller never learns that the hook wants a `rate_limit` PDA, which is
the whole point — this program does not change when the hook's seeds do.

Note what is **not** in `TransferWithHook`: no `extra_account_meta_list`, no
`rate_limit`, no hook program. Those arrive in `remaining_accounts`.

`programs/token-mover/Cargo.toml`:

```toml
[package]
name = "token-mover"
version = "0.1.0"
description = "Moves Token-2022 tokens by CPI, through the transfer hook."
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "token_mover"

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
anchor-debug = []
custom-heap = []
custom-panic = []

[dependencies]
anchor-lang = "1.2.0"
anchor-spl = "1.2.0"
# `add_extra_accounts_for_execute_cpi` lives here. It reads the mint's
# ExtraAccountMetaList and appends exactly the accounts the hook will ask for
# to our transfer_checked instruction, so this program never has to know that
# the hook wants a rate_limit PDA — or how it is derived.
spl-transfer-hook-interface = "2.1.0"
# For the hook program's id. `no-entrypoint` pulls in the crate as a library
# only, without a second `entrypoint!` in the build.
solana-fall-transfer-hook = { path = "../solana-fall-transfer-hook", features = ["no-entrypoint"] }

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ['cfg(target_os, values("solana"))'] }
```

`programs/token-mover/src/lib.rs`:

```rust
//! Challenge 4 — moving tokens from inside a program.
//!
//! A wallet-signed `transfer_checked` carries the hook's extra accounts because
//! the *client* resolved them. A CPI has no client. This program resolves them
//! on-chain instead, which is the only part of a transfer-hook mint that is
//! genuinely harder to integrate with than a plain one.
//!
//! The rate limit still applies: the hook does not care who invoked the
//! transfer, so a program cannot be used to get around it.

use anchor_lang::{prelude::*, solana_program::program::invoke};
use anchor_spl::{
    token_2022::spl_token_2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi;

declare_id!("7XKzJjmVpLbZsLTGHz9wCFxNtV8NTt1ucBAybnYVFyoQ");

#[program]
pub mod token_mover {
    use super::*;

    pub fn move_tokens<'info>(
        ctx: Context<'info, TransferWithHook<'info>>,
        amount: u64,
    ) -> Result<()> {
        handler(ctx, amount)
    }
}

/// Note what is NOT here: no `extra_account_meta_list`, no `rate_limit`, no
/// hook program. Those arrive in `remaining_accounts` and are sorted out by
/// the interface helper, which is the whole point — this struct does not
/// change when the hook's seeds do.
#[derive(Accounts)]
pub struct TransferWithHook<'info> {
    pub owner: Signer<'info>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(
    ctx: Context<'info, TransferWithHook<'info>>,
    amount: u64,
) -> Result<()> {
    let source = ctx.accounts.source_token.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let destination = ctx.accounts.destination_token.to_account_info();
    let owner = ctx.accounts.owner.to_account_info();

    // The transfer as Token-2022 would see it from a wallet: four accounts,
    // no hook accounts at all.
    let mut cpi_ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::ID,
        source.key,
        mint.key,
        destination.key,
        owner.key,
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let mut cpi_infos = vec![
        source.clone(),
        mint.clone(),
        destination.clone(),
        owner.clone(),
    ];

    // Now append what the hook needs. The helper reads the mint's
    // ExtraAccountMetaList out of `remaining_accounts`, resolves every seed in
    // it (including `AccountKey { index: 3 }` — the owner), and pushes the
    // resulting accounts, the list itself and the hook program onto both the
    // instruction and the infos. Every account it resolves has to be present
    // in `remaining_accounts` or this returns IncorrectAccount.
    add_extra_accounts_for_execute_cpi(
        &mut cpi_ix,
        &mut cpi_infos,
        &solana_fall_transfer_hook::ID,
        source,
        mint,
        destination,
        owner,
        amount,
        ctx.remaining_accounts,
    )?;

    // Not `invoke_signed`: the owner signed the outer transaction, so its
    // signature carries through. A PDA-owned token account would need seeds
    // here instead.
    invoke(&cpi_ix, &cpi_infos)?;

    Ok(())
}
```

And `Anchor.toml` gains the second program:

```diff
 [programs.localnet]
+token_mover = "7XKzJjmVpLbZsLTGHz9wCFxNtV8NTt1ucBAybnYVFyoQ"
 solana_fall_transfer_hook = "2JfEsBs1CWdqsrgrPzqZywenRgjTP1cRwuybYyRtccuM"
```

Run `anchor keys sync` after creating the program; the ids above are this
tree's, not anyone else's.

## The tests

```diff
diff --git a/programs/solana-fall-transfer-hook/Cargo.toml b/programs/solana-fall-transfer-hook/Cargo.toml
index cbe8001..ef076de 100644
--- a/programs/solana-fall-transfer-hook/Cargo.toml
+++ b/programs/solana-fall-transfer-hook/Cargo.toml
@@ -40,6 +40,11 @@ spl-transfer-hook-interface = "2.1.0"
 
 
 [dev-dependencies]
+# Challenge 4. The tests build a token-mover instruction, so they need its
+# generated `instruction`/`accounts` modules. A dev-dependency cycle
+# (token-mover depends on this crate) is legal in Cargo and does not affect
+# the on-chain build.
+token-mover = { path = "../token-mover", features = ["no-entrypoint"] }
 litesvm = "0.16.0"
 solana-message = "4.4.1"
 solana-transaction = "4.1.6"
diff --git a/programs/solana-fall-transfer-hook/tests/helpers/mod.rs b/programs/solana-fall-transfer-hook/tests/helpers/mod.rs
index d7facde..3d649a1 100644
--- a/programs/solana-fall-transfer-hook/tests/helpers/mod.rs
+++ b/programs/solana-fall-transfer-hook/tests/helpers/mod.rs
@@ -25,6 +25,10 @@ pub fn setup() -> (LiteSVM, Keypair, Address) {
     let bytes = include_bytes!("../../../../target/deploy/solana_fall_transfer_hook.so");
     svm.add_program(program_id, bytes).unwrap();
 
+    // Challenge 4: the CPI caller has to be on-chain too.
+    let mover = include_bytes!("../../../../target/deploy/token_mover.so");
+    svm.add_program(token_mover::id(), mover).unwrap();
+
     let payer = Keypair::new();
     svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
 
@@ -52,23 +56,36 @@ pub fn initialize_mint(svm: &mut LiteSVM, payer: &Keypair, mint: &Keypair, progr
     send_ix(svm, ix, payer, &[payer, mint]);
 }
 
-// For the challenge - Initialize the rate limit account and the extra account meta list for a given mint
-pub fn initialize_rate_limit(svm: &mut LiteSVM, payer: &Keypair, mint: &Keypair, program_id: &Address) {
-    let rate_limit = Pubkey::find_program_address(
-        &[b"rate_limit"],
+/// Challenge 3: one bucket per (mint, owner). Derived in one place so the
+/// tests and the program cannot drift apart.
+pub fn rate_limit_pda(mint: &Pubkey, owner: &Pubkey, program_id: &Address) -> Pubkey {
+    Pubkey::find_program_address(
+        &[b"rate_limit", mint.as_ref(), owner.as_ref()],
         program_id,
-    ).0;
+    ).0
+}
+
+/// Opens a bucket for `owner`, who pays and therefore signs — the owner is a
+/// seed, so each wallet has to open its own.
+pub fn initialize_rate_limit_for(svm: &mut LiteSVM, owner: &Keypair, mint: &Keypair, program_id: &Address) {
+    let rate_limit = rate_limit_pda(&mint.pubkey(), &owner.pubkey(), program_id);
 
     let ix = Instruction::new_with_bytes(
         *program_id,
         &solana_fall_transfer_hook::instruction::Initialize {}.data(),
         solana_fall_transfer_hook::accounts::Initialize {
-            payer: payer.pubkey(),
+            payer: owner.pubkey(),
+            // Challenge 1: the mint is checked and stored now.
+            mint: mint.pubkey(),
             rate_limit,
             system_program: SYSTEM_PROGRAM_ID,
         }.to_account_metas(None),
     );
-    send_ix(svm, ix, payer, &[payer]);
+    send_ix(svm, ix, owner, &[owner]);
+}
+
+pub fn initialize_rate_limit(svm: &mut LiteSVM, payer: &Keypair, mint: &Keypair, program_id: &Address) {
+    initialize_rate_limit_for(svm, payer, mint, program_id);
 }
 
 pub fn initialize_extra_account_metas(svm: &mut LiteSVM, payer: &Keypair, mint: &Keypair, program_id: &Address) {
@@ -145,10 +162,7 @@ pub fn build_transfer_with_hook_ix(
         program_id,
     ).0;
 
-    let rate_limit = Pubkey::find_program_address(
-        &[b"rate_limit"],
-        program_id,
-    ).0;
+    let rate_limit = rate_limit_pda(mint, owner, program_id);
 
     ix.accounts.push(AccountMeta::new_readonly(*program_id, false));
     ix.accounts.push(AccountMeta::new_readonly(extra_account_meta_list, false));
@@ -156,3 +170,42 @@ pub fn build_transfer_with_hook_ix(
 
     ix
 }
+
+/// Challenge 4: the same transfer, driven by a program.
+///
+/// The extra accounts go in `remaining_accounts` in no particular order —
+/// `add_extra_accounts_for_execute_cpi` looks them up by key. What matters is
+/// that every account the hook will resolve is present, which for this hook
+/// means the ExtraAccountMetaList, the rate limit PDA and the hook program.
+pub fn build_move_tokens_ix(
+    source_ata: &Pubkey,
+    dest_ata: &Pubkey,
+    mint: &Pubkey,
+    owner: &Pubkey,
+    program_id: &Address,
+    amount: u64,
+) -> Instruction {
+    let extra_account_meta_list = Pubkey::find_program_address(
+        &[b"extra-account-metas", mint.as_ref()],
+        program_id,
+    ).0;
+    let rate_limit = rate_limit_pda(mint, owner, program_id);
+
+    let mut metas = token_mover::accounts::TransferWithHook {
+        owner: *owner,
+        source_token: *source_ata,
+        mint: *mint,
+        destination_token: *dest_ata,
+        token_program: Token2022::id(),
+    }.to_account_metas(None);
+
+    metas.push(AccountMeta::new_readonly(*program_id, false));
+    metas.push(AccountMeta::new_readonly(extra_account_meta_list, false));
+    metas.push(AccountMeta::new(rate_limit, false));
+
+    Instruction::new_with_bytes(
+        token_mover::id(),
+        &token_mover::instruction::MoveTokens { amount }.data(),
+        metas,
+    )
+}
diff --git a/programs/solana-fall-transfer-hook/tests/test_initialize.rs b/programs/solana-fall-transfer-hook/tests/test_initialize.rs
index ec3f407..5f150cc 100644
--- a/programs/solana-fall-transfer-hook/tests/test_initialize.rs
+++ b/programs/solana-fall-transfer-hook/tests/test_initialize.rs
@@ -22,9 +22,10 @@ fn test_initialize() {
     // First create the mint via the dedicated instruction
     initialize_mint(&mut svm, &payer, &mint, &program_id);
 
-    // Then initialize the rate limit account
+    // Then initialize the rate limit account. Challenge 3: the seeds now
+    // include the mint and the owner.
     let rate_limit = Pubkey::find_program_address(
-        &[b"rate_limit"],
+        &[b"rate_limit", mint.pubkey().as_ref(), payer.pubkey().as_ref()],
         &program_id,
     ).0;
 
@@ -33,6 +34,8 @@ fn test_initialize() {
         &solana_fall_transfer_hook::instruction::Initialize {}.data(),
         solana_fall_transfer_hook::accounts::Initialize {
             payer: payer.pubkey(),
+            // Challenge 1: the mint is part of the context now.
+            mint: mint.pubkey(),
             rate_limit,
             system_program: SYSTEM_PROGRAM_ID,
         }.to_account_metas(None),
```

### New file: `tests/test_rate_limit_per_owner.rs` (Challenge 3)

```rust
//! Challenge 3 — one limit per (mint, owner).
//!
//! Before the change there was a single program-wide bucket, so the first
//! wallet to move 1,000,000 in an hour used up everybody's allowance. This is
//! the test that says that is no longer true. It fails on the starter for the
//! right reason: both transfers resolve to the same PDA and the second one
//! comes back RateLimitExceeded.

#[allow(dead_code)]
mod helpers;

use {
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

use helpers::{
    build_transfer_with_hook_ix, create_ata, initialize_extra_account_metas,
    initialize_mint, initialize_rate_limit_for, mint_tokens, setup,
};

#[test]
fn two_owners_each_get_their_own_hourly_allowance() {
    let (mut svm, payer, program_id) = setup();
    let mint = Keypair::new();

    initialize_mint(&mut svm, &payer, &mint, &program_id);
    initialize_extra_account_metas(&mut svm, &payer, &mint, &program_id);

    // Two senders. Each opens its own bucket — the owner is a seed, so each
    // has to, and neither can open the other's.
    let alice = payer.insecure_clone();
    let bob = Keypair::new();
    svm.airdrop(&bob.pubkey(), 1_000_000_000).unwrap();

    initialize_rate_limit_for(&mut svm, &alice, &mint, &program_id);
    initialize_rate_limit_for(&mut svm, &bob, &mint, &program_id);

    let recipient = Keypair::new();
    let dest_ata = create_ata(&mut svm, &payer, &recipient.pubkey(), &mint.pubkey());

    let alice_ata = create_ata(&mut svm, &payer, &alice.pubkey(), &mint.pubkey());
    let bob_ata = create_ata(&mut svm, &payer, &bob.pubkey(), &mint.pubkey());

    // The mint authority is `payer`, i.e. alice.
    mint_tokens(&mut svm, &payer, &mint.pubkey(), &alice_ata, 1_000_000);
    mint_tokens(&mut svm, &payer, &mint.pubkey(), &bob_ata, 1_000_000);

    // Alice spends her entire hourly allowance.
    let ix = build_transfer_with_hook_ix(
        &alice_ata, &dest_ata, &mint.pubkey(), &alice.pubkey(), &program_id, 1_000_000, 9,
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&alice.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&alice]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "alice at her limit should succeed: {:?}", res.err());

    // Bob, in the same window, spends his. One shared bucket would refuse
    // this; one bucket each lets it through.
    let ix = build_transfer_with_hook_ix(
        &bob_ata, &dest_ata, &mint.pubkey(), &bob.pubkey(), &program_id, 1_000_000, 9,
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&bob.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&bob]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(
        res.is_ok(),
        "bob has his own allowance and should not be blocked by alice: {:?}",
        res.err()
    );
}
```

### New file: `tests/test_token_mover.rs` (Challenge 4)

```rust
//! Challenge 4 — the transfer driven by a program instead of a wallet.
//!
//! Two things are being proved. First that a CPI can move a hooked token at
//! all, which needs the extra accounts resolved on-chain rather than by a
//! client. Second that going through a program does not get you a fresh
//! allowance: the hook sees the same (mint, owner) bucket either way.

#[allow(dead_code)]
mod helpers;

use {
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

use helpers::{
    build_move_tokens_ix, create_ata, initialize_extra_account_metas, initialize_mint,
    initialize_rate_limit_for, mint_tokens, setup,
};

/// Everything the two tests below share: a hooked mint, a funded sender with a
/// bucket, and a destination.
fn arrange(amount_to_mint: u64) -> (litesvm::LiteSVM, Keypair, solana_pubkey::Pubkey, solana_pubkey::Pubkey, solana_pubkey::Pubkey, solana_keypair::Address) {
    let (mut svm, payer, program_id) = setup();
    let mint = Keypair::new();

    initialize_mint(&mut svm, &payer, &mint, &program_id);
    initialize_extra_account_metas(&mut svm, &payer, &mint, &program_id);
    initialize_rate_limit_for(&mut svm, &payer, &mint, &program_id);

    let recipient = Keypair::new();
    let source_ata = create_ata(&mut svm, &payer, &payer.pubkey(), &mint.pubkey());
    let dest_ata = create_ata(&mut svm, &payer, &recipient.pubkey(), &mint.pubkey());
    mint_tokens(&mut svm, &payer, &mint.pubkey(), &source_ata, amount_to_mint);

    (svm, payer, mint.pubkey(), source_ata, dest_ata, program_id)
}

fn send(
    svm: &mut litesvm::LiteSVM,
    ix: anchor_lang::solana_program::instruction::Instruction,
    payer: &Keypair,
) -> Result<litesvm::types::TransactionMetadata, litesvm::types::FailedTransactionMetadata> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
}

#[test]
fn a_program_can_move_hooked_tokens() {
    let (mut svm, payer, mint, source_ata, dest_ata, program_id) = arrange(1_000_000);

    let ix = build_move_tokens_ix(
        &source_ata, &dest_ata, &mint, &payer.pubkey(), &program_id, 100,
    );

    let res = send(&mut svm, ix, &payer);
    assert!(res.is_ok(), "CPI transfer through the hook failed: {:?}", res.err());
}

#[test]
fn the_rate_limit_still_applies_to_a_program() {
    let (mut svm, payer, mint, source_ata, dest_ata, program_id) = arrange(2_000_000);

    // Spend the whole window through the program.
    let ix = build_move_tokens_ix(
        &source_ata, &dest_ata, &mint, &payer.pubkey(), &program_id, 1_000_000,
    );
    let res = send(&mut svm, ix, &payer);
    assert!(res.is_ok(), "transfer at the limit should succeed: {:?}", res.err());

    // One more base unit, same window. 0x1771 is RateLimitExceeded — the
    // second variant in `error.rs`, so 6000 + 1.
    let ix = build_move_tokens_ix(
        &source_ata, &dest_ata, &mint, &payer.pubkey(), &program_id, 1,
    );
    let err = send(&mut svm, ix, &payer).expect_err("over the limit should fail");

    let rendered = format!("{:?}", err.err);
    assert!(
        rendered.contains("6001") || rendered.to_lowercase().contains("custom"),
        "expected RateLimitExceeded (0x1771), got: {rendered}"
    );
}
```

## Running it

```bash
anchor keys sync
anchor build
cargo test --workspace -- --test-threads=1
python3 grader/grade.py     # prints result.json; exits 0 only at 4/4
```

Expected tail of `result.json`:

```json
"gates": {
  "build": true, "tests": true, "surface": true, "errors": true,
  "met": 4, "of": 4,
  "passing": 7, "failing": 0, "required_passing": 7,
  "new_surface": ["RateLimit.mint"],
  "new_errors": []
}
```

`new_errors` is empty and that is correct — this assignment reuses the shipped
codes. The `errors` gate passed on the use count (3, up from 2), which the
notes say out loud.

## One thing that will bite before any of this does

**`anchor build` does not work on this repo with a stock Solana install.**

The committed `Cargo.lock` pins `ctutils 0.4.2` and `wincode 0.5.5`, both of
which declare `edition2024`. The `cargo-build-sbf` that ships with current
stable Agave (3.0.10) uses platform-tools **v1.51**, whose bundled Cargo is
1.84.1 — and 1.84 cannot parse an `edition2024` manifest. The build dies during
dependency resolution, before compiling a line:

```
error: failed to parse manifest at .../ctutils-0.4.2/Cargo.toml
  feature `edition2024` is required
```

This is not caused by anything a learner does, and `--tools-version` on
`anchor build` does not fix it — Anchor passes its own value through to
`cargo-build-sbf` and overrides yours. What works is putting a newer
platform-tools at the path the v1.51 toolchain is linked from:

```bash
curl -sSfL -o /tmp/pt.tar.bz2 \
  https://github.com/anza-xyz/platform-tools/releases/download/v1.55/platform-tools-linux-x86_64.tar.bz2
mkdir -p "$HOME/.cache/solana/v1.51/platform-tools"
tar xjf /tmp/pt.tar.bz2 -C "$HOME/.cache/solana/v1.51/platform-tools"
anchor build
```

The grading workflow does exactly this, with the tarball pinned by SHA-256.
Learners building locally need the same three lines, so they belong in the
repo README rather than only in CI.
