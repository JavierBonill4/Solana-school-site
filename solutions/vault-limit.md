# Reference solution — Assignment 01, Vault withdrawal limit

Admin only. Verified: this compiles against `ASCorreia/solana-fall-vault` at
`main`, and the byte layout below was confirmed by serializing `VaultState`.

## Byte layout (Checkpoint 2)

Confirmed with a native Borsh round trip, not assumed:

```
0..8    Anchor discriminator
8       vault_bump   : u8
9       bump         : u8
10..18  max_withdraw : u64, little-endian
```

`VaultState::INIT_SPACE` = 10, account data length = 18. `#[derive(InitSpace)]`
recalculates this, so `space = ANCHOR_DISCRIMINATOR_LENGTH + VaultState::INIT_SPACE`
in `initialize.rs` needs no edit. Appending the field keeps the existing
`data[8]` / `data[9]` assertions in `test_initialize.rs` passing — prepending
it breaks them, which is the trap the checkpoint is set up to spring.

## Program diff (Checkpoints 2–5)

```diff
diff --git a/programs/lamports-vault/src/error.rs b/programs/lamports-vault/src/error.rs
index c37199a..6f977bd 100644
--- a/programs/lamports-vault/src/error.rs
+++ b/programs/lamports-vault/src/error.rs
@@ -4,4 +4,6 @@ use anchor_lang::prelude::*;
 pub enum ErrorCode {
     #[msg("Custom error message")]
     CustomError,
+    #[msg("Requested amount exceeds this vault's per-transaction withdrawal limit")]
+    ExceedsMaxWithdraw,
 }
diff --git a/programs/lamports-vault/src/instructions/initialize.rs b/programs/lamports-vault/src/instructions/initialize.rs
index 711a8b7..11101a3 100644
--- a/programs/lamports-vault/src/instructions/initialize.rs
+++ b/programs/lamports-vault/src/instructions/initialize.rs
@@ -23,7 +23,7 @@ pub struct Initialize<'info> {
     pub system_program: Program<'info, System>,
 }
 
-pub fn initialize_vault(ctx: Context<Initialize>) -> Result<()> {
+pub fn initialize_vault(ctx: Context<Initialize>, max_withdraw: u64) -> Result<()> {
     msg!("Initializing vault for user: {}", ctx.accounts.user.key());
 
     let cpi_acccounts = anchor_lang::system_program::Transfer {
@@ -38,8 +38,9 @@ pub fn initialize_vault(ctx: Context<Initialize>) -> Result<()> {
     anchor_lang::system_program::transfer(cpi_ctx, rent)?;
 
     ctx.accounts.vault_state.set_inner(VaultState {
-        vault_bump: ctx.bumps.vault, 
-        bump: ctx.bumps.vault_state
+        vault_bump: ctx.bumps.vault,
+        bump: ctx.bumps.vault_state,
+        max_withdraw,
     });
     
     Ok(())
diff --git a/programs/lamports-vault/src/instructions/withdraw.rs b/programs/lamports-vault/src/instructions/withdraw.rs
index e792c0f..882d435 100644
--- a/programs/lamports-vault/src/instructions/withdraw.rs
+++ b/programs/lamports-vault/src/instructions/withdraw.rs
@@ -1,6 +1,6 @@
 use anchor_lang::prelude::*;
 
-use crate::{VAULT_SEED, VAULT_STATE_SEED, VaultState};
+use crate::{error::ErrorCode, VAULT_SEED, VAULT_STATE_SEED, VaultState};
 
 #[derive(Accounts)]
 pub struct Withdraw<'info> {
@@ -23,6 +23,12 @@ pub struct Withdraw<'info> {
 
 pub fn withdraw_lamports(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
     msg!("Withdrawing lamports from vault");
+
+    require!(
+        amount <= ctx.accounts.vault_state.max_withdraw,
+        ErrorCode::ExceedsMaxWithdraw
+    );
+
     let cpi_accounts = anchor_lang::system_program::Transfer {
         from: ctx.accounts.vault.to_account_info(),
         to: ctx.accounts.user.to_account_info(),
diff --git a/programs/lamports-vault/src/lib.rs b/programs/lamports-vault/src/lib.rs
index 71f6c22..453e59a 100644
--- a/programs/lamports-vault/src/lib.rs
+++ b/programs/lamports-vault/src/lib.rs
@@ -15,8 +15,8 @@ declare_id!("9AvGuh5C8cYcYU7RwwWQU9iDFqWpjQ9MnGZ8cfbkJPLc");
 pub mod lamports_vault {
     use super::*;
 
-    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
-        initialize::initialize_vault(ctx)
+    pub fn initialize(ctx: Context<Initialize>, max_withdraw: u64) -> Result<()> {
+        initialize::initialize_vault(ctx, max_withdraw)
     }
 
     pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
diff --git a/programs/lamports-vault/src/state/vault_state.rs b/programs/lamports-vault/src/state/vault_state.rs
index 88c5aef..9c5f386 100644
--- a/programs/lamports-vault/src/state/vault_state.rs
+++ b/programs/lamports-vault/src/state/vault_state.rs
@@ -5,4 +5,5 @@ use anchor_lang::prelude::*;
 pub struct VaultState {
     pub vault_bump: u8,     // The bump seed for the vault account PDA
     pub bump: u8,           // The bump seed for the VaultState PDA itself
-}
\ No newline at end of file
+    pub max_withdraw: u64,  // Ceiling on lamports moved by a single withdraw
+}
```

## Test harness (Checkpoint 6)

`build_initialize_ix` and `initialize_vault` take the cap and pass it through:

```rust
pub fn build_initialize_ix(payer: &Pubkey, max_withdraw: u64) -> Instruction {
    // …
    &lamports_vault::instruction::Initialize { max_withdraw }.data(),
    // …
}

pub fn initialize_vault(svm: &mut LiteSVM, payer: &Keypair, max_withdraw: u64) {
    let ix = build_initialize_ix(&payer.pubkey(), max_withdraw);
    send(svm, payer, &[ix], &[]).expect("initialize should succeed");
}
```

Then eleven call sites across `test_initialize.rs`, `test_deposit.rs` and
`test_withdraw.rs` pass `100 * ONE_SOL`, a cap high enough never to interfere
with what those tests are actually about.

## The three withdrawal tests (Checkpoint 7)

```rust
#[test]
fn withdraw_under_the_cap_succeeds() {
    let mut svm = setup_svm();
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey(), 10 * ONE_SOL);
    initialize_vault(&mut svm, &user, 2 * ONE_SOL);
    send(&mut svm, &user, &[build_deposit_ix(&user.pubkey(), 5 * ONE_SOL)], &[])
        .expect("deposit should succeed");

    send(&mut svm, &user, &[build_withdraw_ix(&user.pubkey(), ONE_SOL)], &[])
        .expect("one SOL is under the two SOL cap and should succeed");
}

#[test]
fn withdraw_of_exactly_the_cap_succeeds() {
    let mut svm = setup_svm();
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey(), 10 * ONE_SOL);
    initialize_vault(&mut svm, &user, 2 * ONE_SOL);
    send(&mut svm, &user, &[build_deposit_ix(&user.pubkey(), 5 * ONE_SOL)], &[])
        .expect("deposit should succeed");

    send(&mut svm, &user, &[build_withdraw_ix(&user.pubkey(), 2 * ONE_SOL)], &[])
        .expect("exactly the cap must succeed — the rule is <=, not <");
}

#[test]
fn withdraw_one_over_the_cap_fails() {
    let mut svm = setup_svm();
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey(), 10 * ONE_SOL);
    initialize_vault(&mut svm, &user, 2 * ONE_SOL);
    send(&mut svm, &user, &[build_deposit_ix(&user.pubkey(), 5 * ONE_SOL)], &[])
        .expect("deposit should succeed");

    let res = send(
        &mut svm,
        &user,
        &[build_withdraw_ix(&user.pubkey(), 2 * ONE_SOL + 1)],
        &[],
    );
    assert!(res.is_err(), "one lamport over the cap must be rejected");

    let err = res.unwrap_err();
    assert!(
        err.meta.logs.iter().any(|l| l.contains("ExceedsMaxWithdraw")),
        "the failure should be your error, not an incidental one: {:?}",
        err.meta.logs
    );
}
```

## Marking notes

**The boundary pair is the whole assignment.** Tests 2 and 3 are the only ones
that separate `<=` from `<`. A submission with "works" and "obviously too much"
passes both a correct and an off-by-one implementation, and the mutation half
is built to catch exactly that: the `off-by-one-strict` mutant survives any
suite missing the at-the-cap test.

**Common near-misses worth a comment rather than a rejection:**

- Cap checked after the CPI. The transaction still reverts, so a pass/fail
  assertion cannot tell — but it burns compute and it is the wrong shape. The
  canonical suite checks the vault balance is untouched, which catches the
  version that reorders and forgets to `?`.
- `require_gte!` with the operands swapped. Compiles, reads fine, rejects
  everything.
- Deleting the placeholder `CustomError`. Shifts every error number down by
  one, so `ExceedsMaxWithdraw` becomes 6000 and any client branching on 6001
  silently mis-reports.
- Hardcoding the cap as a constant instead of taking the argument. Passes a
  single-vault test suite; the canonical `the_cap_is_per_vault_not_global`
  test is what catches it.
