# Reference solution — Assignment 02, Escrow cancel time lock

Admin only. Verified: this compiles against `ASCorreia/solana-summer-escrow` at
`main` with the change applied, and the canonical suite in
`challenge-layers/escrow-timelock/` was compile-checked against this exact
tree (`cargo test --no-run --test canonical`, anchor-lang 1.0.2, litesvm
0.13.0).

## The shape of the checkpoint

The escrow as shipped lets a maker cancel at any instant — including the
instant after someone submits a take. Checkpoint 6 stamps each escrow with its
creation time and holds cancellation shut for five minutes.

Four edits, one per file, and the order they go in matters in exactly one
place: the `require!` has to run **before** any token moves, or a refused
cancel still empties the vault.

## Byte layout

`created_at: i64` is **appended**, after `bump`. `#[derive(InitSpace)]`
recalculates `Escrow::INIT_SPACE`, so `space = 8 + Escrow::INIT_SPACE` in
`make.rs` needs no edit — the account just gets 8 bytes longer.

Appending rather than inserting is deliberate: every offset the existing tests
assert stays where it was. Inserting `created_at` before `seed` shifts the tail
and is the trap the checkpoint is set up to spring.

## Program diff

```diff
diff --git a/programs/escrow/src/constants.rs b/programs/escrow/src/constants.rs
index fae4535..f8258f5 100644
--- a/programs/escrow/src/constants.rs
+++ b/programs/escrow/src/constants.rs
@@ -2,3 +2,7 @@ use anchor_lang::prelude::*;
 
 #[constant]
 pub const SEED: &str = "anchor";
+
+/// How long a freshly made offer cannot be cancelled for.
+#[constant]
+pub const CANCEL_DELAY_SECONDS: i64 = 300;
diff --git a/programs/escrow/src/error.rs b/programs/escrow/src/error.rs
index c37199a..4f8ba07 100644
--- a/programs/escrow/src/error.rs
+++ b/programs/escrow/src/error.rs
@@ -4,4 +4,8 @@ use anchor_lang::prelude::*;
 pub enum ErrorCode {
     #[msg("Custom error message")]
     CustomError,
+    #[msg("This escrow cannot be cancelled yet — the time lock has not elapsed")]
+    TimeLockActive,
+    #[msg("Arithmetic overflow")]
+    ArithmeticError,
 }
diff --git a/programs/escrow/src/instructions/cancel.rs b/programs/escrow/src/instructions/cancel.rs
index bf30652..704a8b0 100644
--- a/programs/escrow/src/instructions/cancel.rs
+++ b/programs/escrow/src/instructions/cancel.rs
@@ -1,7 +1,7 @@
 use anchor_lang::prelude::*;
 use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
 
-use crate::Escrow;
+use crate::{error::ErrorCode, Escrow, CANCEL_DELAY_SECONDS};
 
 #[derive(Accounts)]
 pub struct Cancel<'info> {
@@ -30,6 +30,15 @@ pub struct Cancel<'info> {
 }
 
 pub fn handler(ctx: Context<Cancel>) -> Result<()> {
+    let now = Clock::get()?.unix_timestamp;
+    let unlocks_at = ctx
+        .accounts
+        .escrow
+        .created_at
+        .checked_add(CANCEL_DELAY_SECONDS)
+        .ok_or(ErrorCode::ArithmeticError)?;
+    require!(now >= unlocks_at, ErrorCode::TimeLockActive);
+
     let cpi_accounts = anchor_spl::token_interface::TransferChecked {
         from: ctx.accounts.vault_a.to_account_info(),
         mint: ctx.accounts.mint_a.to_account_info(),
diff --git a/programs/escrow/src/instructions/make.rs b/programs/escrow/src/instructions/make.rs
index e5a1cf9..2781d97 100644
--- a/programs/escrow/src/instructions/make.rs
+++ b/programs/escrow/src/instructions/make.rs
@@ -48,6 +48,7 @@ pub fn handler(ctx: Context<Make>, seed: u16, amount_a: u64, amount_b: u64) -> R
         amount_b,
         seed,
         bump: ctx.bumps.escrow,
+        created_at: Clock::get()?.unix_timestamp,
     });
 
     let cpi_accounts = TransferChecked {
diff --git a/programs/escrow/src/state/escrow.rs b/programs/escrow/src/state/escrow.rs
index 46cea78..5580988 100644
--- a/programs/escrow/src/state/escrow.rs
+++ b/programs/escrow/src/state/escrow.rs
@@ -10,4 +10,5 @@ pub struct Escrow {
     pub amount_b: u64,          // The amount of the token being requested by the maker
     pub seed: u16,              // The seed used for PDA derivation
     pub bump: u8,               // The bump used for PDA derivation
+    pub created_at: i64,        // Unix seconds when the escrow was made
 }
\ No newline at end of file
```

## Why `>=` and not `>`

The spec says the lock elapses *at* `created_at + 300`. `>` refuses the cancel
for one extra second. That single character is the only difference the
canonical suite's `cancel_at_the_exact_boundary_succeeds` exists to catch, and
it is the mutant to build if this challenge ever gets a mutant pack.

## Why `checked_add`

`created_at` comes from the clock, so overflow is not reachable in practice.
It is there because `i64 + i64` in a release build with
`overflow-checks = true` (which this workspace sets) panics rather than
returning an error, and a panic in a Solana program is a far worse failure mode
than a declared error. Students who write `created_at + CANCEL_DELAY_SECONDS`
still pass every test; the `checked_add` is the better answer, not the required
one.

## Testing it (Checkpoint 6, the learner's half)

LiteSVM starts a fresh `Clock` at `unix_timestamp = 0`, so a test has to move
time itself:

```rust
let mut clock = svm.get_sysvar::<Clock>();
clock.unix_timestamp = created_at + 300;
svm.set_sysvar(&clock);
svm.expire_blockhash();
```

The `expire_blockhash()` is the part people miss. Without it, a second cancel
attempt with the same instruction and the same blockhash is deduplicated as an
already-processed transaction, and the test fails with something that looks
nothing like a time-lock error.

`tests/test_cancel.rs` already exists upstream and tests the happy path, so the
tutorial's Checkpoint 6 instruction to *create* it is wrong — students should
be told to extend it. Worth fixing in the tutorial text.
