# Reference solution — Assignment 06, Pinocchio Escrow

Admin only.

**Verified by running it.** This exact tree was built with `cargo build-sbf`
(Agave 3.1.14, platform-tools v1.52) from a clean clone of
`JavierBonill4/solana-fall-pescrow` with the grading layer applied, and run
with `cargo test`: **6 tests, 6 passing, 0 failing**. The grading layer in
`challenge-layers/pinocchio-escrow/` then returned **gates 4/4, exit 0**. The
untouched starter returns **1/4** through the same grader. A grader that
passes everything proves nothing, so the starter run is the other half of the
check.

## What the three guide challenges actually ask for

| # | Challenge | Files | New tests |
|---|---|---|---|
| 1 | Implement Take | `instructions/take.rs`, arm in `lib.rs`, `instructions/mod.rs` | 0 |
| 2 | Implement Cancel, reject MakeV2 | `instructions/cancel.rs`, two arms in `lib.rs` | 0 |
| 3 | Prove it with tests | `tests/mod.rs` | 4 |

The starter reports **2** passing: `test_make_instruction`, and `test_id`,
which `declare_id!` generates on its own. Two plus four is the bar of **6**
the grader enforces. That is five real tests, which matches the guide's
definition of done.

`instructions/shared.rs` is optional. The guide's hint for Challenge 2
suggests it, and this solution takes the hint.

## How each challenge maps onto a gate

The gates were chosen to line up with the guide, not the other way round.
Pinocchio has no IDL and no `#[error_code]`, so two gates are read from the
dispatch `match` instead.

- **`build`**: nothing special. It is the floor.
- **`surface`**: needs **Challenges 1 and 2 together**. Take and Cancel each
  need an arm in the `match` that calls a handler. The starter sends both to
  `_ => Err(InvalidInstructionData)`. Take alone gets you nothing here.
- **`errors`**: satisfied by the last line of **Challenge 2**: MakeV2 gets
  its own arm that returns an error, and the `_ =>` arm goes. Once the
  wildcard is gone, Rust's exhaustiveness check forces a MakeV2 arm, so the
  grader only has to confirm the arm returns `Err` and doesn't route into
  Make.
- **`tests`**: needs **Challenge 3**.

So all three challenges matter. A learner who implements Take and Cancel but
keeps `_ =>` gets 3/4 once the tests are in, and no points beyond the 20-point
attempt credit.

## The dispatch (Challenges 1 and 2)

`src/lib.rs`: the TODO comment and the wildcard are replaced by three arms.

```rust
match EscrowInstructions::try_from(discriminator)? {
    EscrowInstructions::Make => instructions::process_make_instruction(accounts, data)?,
    EscrowInstructions::Take => instructions::process_take_instruction(accounts)?,
    EscrowInstructions::Cancel => {
        instructions::process_cancel_instruction(accounts)?
    }
    // MakeV2 is reserved but not implemented: say so, rather than let a wildcard hide it.
    EscrowInstructions::MakeV2 => return Err(ProgramError::InvalidInstructionData),
}
```

`src/instructions/mod.rs` registers the new modules. The enum and its
`TryFrom` are unchanged. The `_ =>` inside `TryFrom` is correct and stays:
it handles unknown *bytes*, not unknown *variants*.

```rust
pub mod make;
pub mod take;
pub mod cancel;
pub mod shared;

pub use make::*;
pub use take::*;
pub use cancel::*;
```

Neither Take nor Cancel takes instruction data. The handlers take only
`accounts`. The discriminator byte is the whole payload.

## The shared tail

Take and Cancel end the same way: drain the vault somewhere, close the vault,
close the escrow. The validation at the start is also shared. Everything here
takes `&mut AccountView` where it mutates, because in 0.11 `set_lamports` and
`close` need it.

`src/instructions/shared.rs`:

```rust
use pinocchio::{AccountView, ProgramResult, cpi::Signer, error::ProgramError};

use crate::state::Escrow;

/// Load the escrow, check it is ours and names this maker and mint A, copy out
/// what the caller needs, and re-derive the PDA from the stored bump.
/// Returns (amount_to_receive, mint_b, bump). The RefMut is dropped before return.
pub fn load_and_check_escrow(
    escrow_account: &mut AccountView,
    maker: &AccountView,
    mint_a: &AccountView,
) -> Result<(u64, pinocchio::Address, u8), ProgramError> {
    if !escrow_account.owned_by(&crate::ID) {
        return Err(ProgramError::InvalidAccountOwner);
    }
    let (amount_to_receive, mint_b, bump) = {
        let escrow = Escrow::load_mut(escrow_account)?;
        if escrow.maker() != *maker.address() {
            return Err(ProgramError::InvalidAccountData);
        }
        if escrow.mint_a() != *mint_a.address() {
            return Err(ProgramError::InvalidAccountData);
        }
        (escrow.amount_to_receive(), escrow.mint_b(), escrow.bump)
    };
    let pda = pinocchio_pubkey::derive_address(
        &[b"escrow", maker.address().as_ref(), &[bump]],
        None,
        &crate::ID.to_bytes(),
    );
    if pda != *escrow_account.address().as_array() {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok((amount_to_receive, mint_b, bump))
}

/// Vault must be the token account owned by the escrow PDA for mint A. Returns its balance.
pub fn check_vault(vault: &AccountView, escrow_account: &AccountView, mint_a: &AccountView) -> Result<u64, ProgramError> {
    let v = pinocchio_token::state::Account::from_account_view(vault)?;
    if v.owner() != escrow_account.address() || v.mint() != mint_a.address() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(v.amount())
}

/// Drain the vault to `destination`, close the vault and the escrow, rent to the maker.
pub fn drain_and_close(
    vault: &AccountView,
    destination: &AccountView,
    escrow_account: &mut AccountView,
    maker: &mut AccountView,
    amount: u64,
    signer: Signer,
) -> ProgramResult {
    pinocchio_token::instructions::Transfer {
        from: vault,
        to: destination,
        authority: escrow_account,
        multisig_signers: &[] as &[&AccountView],
        amount,
    }.invoke_signed(&[signer.clone()])?;

    pinocchio_token::instructions::CloseAccount {
        account: vault,
        destination: maker,
        authority: escrow_account,
        multisig_signers: &[] as &[&AccountView],
    }.invoke_signed(&[signer])?;

    maker.set_lamports(maker.lamports() + escrow_account.lamports());
    escrow_account.set_lamports(0);
    escrow_account.close()?;
    Ok(())
}
```

## Challenge 1: Take

`src/instructions/take.rs`. The account order follows the guide's table, and
the comment at the top is the API, since there is no IDL.

```rust
// Accounts:
//  0 taker (w, s)  1 maker (w)  2 mint_a  3 mint_b  4 escrow (w)  5 vault (w)
//  6 taker_ata_a (w)  7 taker_ata_b (w)  8 maker_ata_b (w)
//  9 system_program  10 token_program  11 associated_token_program
use pinocchio::{AccountView, ProgramResult, cpi::{Seed, Signer}, error::ProgramError};

use super::shared::*;

pub fn process_take_instruction(accounts: &mut [AccountView]) -> ProgramResult {
    let [taker, maker, mint_a, mint_b, escrow_account, vault, taker_ata_a, taker_ata_b, maker_ata_b, system_program, token_program, _ata_program @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !taker.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let (amount_to_receive, stored_mint_b, bump) = load_and_check_escrow(escrow_account, maker, mint_a)?;
    if stored_mint_b != *mint_b.address() {
        return Err(ProgramError::InvalidAccountData);
    }
    let vault_amount = check_vault(vault, escrow_account, mint_a)?;

    pinocchio_associated_token_account::instructions::CreateIdempotent {
        funding_account: taker, account: taker_ata_a, wallet: taker, mint: mint_a, system_program, token_program,
    }.invoke()?;
    pinocchio_associated_token_account::instructions::CreateIdempotent {
        funding_account: taker, account: maker_ata_b, wallet: maker, mint: mint_b, system_program, token_program,
    }.invoke()?;
    {
        let t = pinocchio_token::state::Account::from_account_view(taker_ata_b)?;
        if t.owner() != taker.address() || t.mint() != mint_b.address() {
            return Err(ProgramError::InvalidAccountData);
        }
    }

    pinocchio_token::instructions::Transfer {
        from: taker_ata_b, to: maker_ata_b, authority: taker,
        multisig_signers: &[] as &[&AccountView], amount: amount_to_receive,
    }.invoke()?;

    let maker_key = *maker.address().as_array();
    let bump_bytes = [bump];
    let seed = [Seed::from(b"escrow"), Seed::from(&maker_key), Seed::from(&bump_bytes)];
    drain_and_close(vault, taker_ata_a, escrow_account, maker, vault_amount, Signer::from(&seed))
}
```

### The part that trips people up

**`maker_key` is copied out before the `Seed` is built.** The guide's hint
writes `Seed::from(maker.address().as_array())`, which borrows `maker`
immutably for as long as the `Signer` lives. `drain_and_close` then needs
`maker` mutably to pay it the escrow's rent, and the compiler refuses:

```
error[E0502]: cannot borrow `*maker` as mutable because it is also borrowed as immutable
```

Copying the 32 bytes into a local ends the borrow. Inline code that never
passes `maker` mutably while the signer is alive doesn't hit this. Any
learner who factors the tail into a helper will, so expect it in office hours.

**Move `vault_amount`, not `amount_to_give`.** The guide says so explicitly.
They are equal unless someone sends extra A to the vault. If they differ, a
Take that moves `amount_to_give` leaves the rest behind, and `CloseAccount`
then fails on a non-empty account.

## Challenge 2: Cancel

`src/instructions/cancel.rs`:

```rust
// Accounts:
//  0 maker (w, s)  1 mint_a  2 escrow (w)  3 vault (w)  4 maker_ata_a (w)  5 token_program
use pinocchio::{AccountView, ProgramResult, cpi::{Seed, Signer}, error::ProgramError};

use super::shared::*;

pub fn process_cancel_instruction(accounts: &mut [AccountView]) -> ProgramResult {
    let [maker, mint_a, escrow_account, vault, maker_ata_a, _token_program @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !maker.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let (_, _, bump) = load_and_check_escrow(escrow_account, maker, mint_a)?;
    let vault_amount = check_vault(vault, escrow_account, mint_a)?;
    {
        let m = pinocchio_token::state::Account::from_account_view(maker_ata_a)?;
        if m.owner() != maker.address() || m.mint() != mint_a.address() {
            return Err(ProgramError::InvalidAccountData);
        }
    }
    let maker_key = *maker.address().as_array();
    let bump_bytes = [bump];
    let seed = [Seed::from(b"escrow"), Seed::from(&maker_key), Seed::from(&bump_bytes)];
    drain_and_close(vault, maker_ata_a, escrow_account, maker, vault_amount, Signer::from(&seed))
}
```

The stranger's Cancel is refused three ways: the signer check, the
stored-maker check, and the PDA re-derivation. That redundancy is deliberate,
and it matters for marking. See the marking notes below.

## Challenge 3: the tests

Added to the end of the `mod tests` block in `src/tests/mod.rs`, after
`test_make_instruction`. The `make()` helper reuses `setup()`, so the Rent
sysvar override comes along. Losing it makes every test fail at Make with
`InsufficientFundsForRent`.

```rust
    // ── helpers for Take / Cancel ─────────────────────────────────────────

    struct Made { svm: LiteSVM, maker: Keypair, mint_a: Pubkey, mint_b: Pubkey, escrow: Pubkey, vault: Pubkey, maker_ata_a: Pubkey }

    fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        spl_associated_token_account::get_associated_token_address(owner, mint)
    }

    fn token_amount(svm: &LiteSVM, addr: &Pubkey) -> u64 {
        let acc = svm.get_account(addr).unwrap();
        spl_token_2022::state::Account::unpack(&acc.data).unwrap().amount
    }

    fn gone(svm: &LiteSVM, addr: &Pubkey) -> bool {
        match svm.get_account(addr) {
            None => true,
            Some(a) => a.lamports == 0 && a.owner == solana_sdk_ids::system_program::ID,
        }
    }

    fn make() -> Made {
        let (mut svm, maker) = setup();
        let mint_a = CreateMint::new(&mut svm, &maker).decimals(6).authority(&maker.pubkey()).send().unwrap();
        let mint_b = CreateMint::new(&mut svm, &maker).decimals(6).authority(&maker.pubkey()).send().unwrap();
        let maker_ata_a = CreateAssociatedTokenAccount::new(&mut svm, &maker, &mint_a).owner(&maker.pubkey()).send().unwrap();
        MintTo::new(&mut svm, &maker, &mint_a, &maker_ata_a, 1_000_000_000).send().unwrap();
        let (escrow, _) = Pubkey::find_program_address(&[b"escrow".as_ref(), maker.pubkey().as_ref()], &program_id());
        let vault = ata(&escrow, &mint_a);
        let data = [vec![0u8], 100_000_000u64.to_le_bytes().to_vec(), 500_000_000u64.to_le_bytes().to_vec()].concat();
        let ix = Instruction {
            program_id: program_id(),
            accounts: vec![
                AccountMeta::new(maker.pubkey(), true),
                AccountMeta::new_readonly(mint_a, false),
                AccountMeta::new_readonly(mint_b, false),
                AccountMeta::new(escrow, false),
                AccountMeta::new(maker_ata_a, false),
                AccountMeta::new(vault, false),
                AccountMeta::new_readonly(solana_sdk_ids::system_program::ID, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
                AccountMeta::new_readonly(ASSOCIATED_TOKEN_PROGRAM_ID.parse().unwrap(), false),
            ],
            data,
        };
        let tx = Transaction::new(&[&maker], Message::new(&[ix], Some(&maker.pubkey())), svm.latest_blockhash());
        svm.send_transaction(tx).unwrap();
        Made { svm, maker, mint_a, mint_b, escrow, vault, maker_ata_a }
    }

    fn funded_taker(m: &mut Made, amount_b: u64) -> (Keypair, Pubkey) {
        let taker = Keypair::new();
        m.svm.airdrop(&taker.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let taker_ata_b = CreateAssociatedTokenAccount::new(&mut m.svm, &taker, &m.mint_b).owner(&taker.pubkey()).send().unwrap();
        MintTo::new(&mut m.svm, &m.maker, &m.mint_b, &taker_ata_b, amount_b).send().unwrap();
        (taker, taker_ata_b)
    }

    fn take_ix(m: &Made, taker: &Pubkey, taker_ata_b: &Pubkey) -> Instruction {
        Instruction {
            program_id: program_id(),
            accounts: vec![
                AccountMeta::new(*taker, true),
                AccountMeta::new(m.maker.pubkey(), false),
                AccountMeta::new_readonly(m.mint_a, false),
                AccountMeta::new_readonly(m.mint_b, false),
                AccountMeta::new(m.escrow, false),
                AccountMeta::new(m.vault, false),
                AccountMeta::new(ata(taker, &m.mint_a), false),
                AccountMeta::new(*taker_ata_b, false),
                AccountMeta::new(ata(&m.maker.pubkey(), &m.mint_b), false),
                AccountMeta::new_readonly(solana_sdk_ids::system_program::ID, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
                AccountMeta::new_readonly(ASSOCIATED_TOKEN_PROGRAM_ID.parse().unwrap(), false),
            ],
            data: vec![1u8],
        }
    }

    fn cancel_ix(m: &Made, signer: &Pubkey) -> Instruction {
        Instruction {
            program_id: program_id(),
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new_readonly(m.mint_a, false),
                AccountMeta::new(m.escrow, false),
                AccountMeta::new(m.vault, false),
                AccountMeta::new(m.maker_ata_a, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
            ],
            data: vec![2u8],
        }
    }

    #[test]
    fn test_take_instruction() {
        let mut m = make();
        let (taker, taker_ata_b) = funded_taker(&mut m, 100_000_000);
        let maker_sol = m.svm.get_account(&m.maker.pubkey()).unwrap().lamports;
        let ix = take_ix(&m, &taker.pubkey(), &taker_ata_b);
        let tx = Transaction::new(&[&taker], Message::new(&[ix], Some(&taker.pubkey())), m.svm.latest_blockhash());
        let r = m.svm.send_transaction(tx).unwrap();
        println!("Take CUs Consumed: {}", r.compute_units_consumed);
        assert_eq!(token_amount(&m.svm, &ata(&taker.pubkey(), &m.mint_a)), 500_000_000);
        assert_eq!(token_amount(&m.svm, &ata(&m.maker.pubkey(), &m.mint_b)), 100_000_000);
        assert!(gone(&m.svm, &m.vault));
        assert!(gone(&m.svm, &m.escrow));
        assert!(m.svm.get_account(&m.maker.pubkey()).unwrap().lamports > maker_sol);
    }

    #[test]
    fn test_cancel_instruction() {
        let mut m = make();
        let ix = cancel_ix(&m, &m.maker.pubkey());
        let tx = Transaction::new(&[&m.maker], Message::new(&[ix], Some(&m.maker.pubkey())), m.svm.latest_blockhash());
        let r = m.svm.send_transaction(tx).unwrap();
        println!("Cancel CUs Consumed: {}", r.compute_units_consumed);
        assert_eq!(token_amount(&m.svm, &m.maker_ata_a), 1_000_000_000);
        assert!(gone(&m.svm, &m.vault));
        assert!(gone(&m.svm, &m.escrow));
    }

    #[test]
    fn test_take_underfunded_fails() {
        let mut m = make();
        let (taker, taker_ata_b) = funded_taker(&mut m, 50_000_000);
        let ix = take_ix(&m, &taker.pubkey(), &taker_ata_b);
        let tx = Transaction::new(&[&taker], Message::new(&[ix], Some(&taker.pubkey())), m.svm.latest_blockhash());
        assert!(m.svm.send_transaction(tx).is_err());
        assert_eq!(token_amount(&m.svm, &m.vault), 500_000_000);
        assert_eq!(token_amount(&m.svm, &taker_ata_b), 50_000_000);
    }

    #[test]
    fn test_cancel_by_stranger_fails() {
        let mut m = make();
        let stranger = Keypair::new();
        m.svm.airdrop(&stranger.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let ix = cancel_ix(&m, &stranger.pubkey());
        let tx = Transaction::new(&[&stranger], Message::new(&[ix], Some(&stranger.pubkey())), m.svm.latest_blockhash());
        assert!(m.svm.send_transaction(tx).is_err(), "a stranger must not be able to cancel someone else's escrow");
        assert_eq!(token_amount(&m.svm, &m.vault), 500_000_000);
    }
```

The test never creates the maker's ATA for mint B. Take's `CreateIdempotent`
does it, which is why the guide's step 3 says not to create it in the test.

## Running it

```bash
cargo build-sbf
cargo test -- --nocapture --test-threads=1
python3 grader/grade.py     # prints result.json; exits 0 only at 4/4
```

Compute, from this tree:

| Instruction | CU |
|---|---|
| Make | 31,288 |
| Take | 68,452 |
| Cancel | 10,421 |

Take costs about twice what Make does, and that's expected. Most of it is the
two `CreateIdempotent` CPIs, each a full trip through the ATA program even
when the account already exists. Cancel is cheap because it makes no ATAs
and derives the PDA from the stored bump in one hash.

Expected tail of `result.json`:

```json
"gates": {
  "build": true, "tests": true, "surface": true, "errors": true,
  "met": 4, "of": 4,
  "passing": 6, "failing": 0, "required_passing": 6,
  "new_surface": ["Take", "Cancel"],
  "new_errors": ["MakeV2"]
}
```

The notes list the handler each new instruction is routed to, for example
`Take → instructions::process_take_instruction`. That tells you where to
look before you open a file.

## Marking notes

**The stranger test doesn't prove the signer check exists.** This is the one
to know. With `if !maker.is_signer()` deleted from Cancel, **all five of the
guide's tests still pass**. The stranger puts *their own* key in slot 0, so
the stored-maker check and the PDA re-derivation both refuse it before the
signer check matters. This was verified by removing the check and running
the suite.

What catches it is a sixth test the guide doesn't ask for: the real maker's
key in slot 0 *unsigned*, with the stranger paying fees.

```rust
let mut ix = cancel_ix(&m, &m.maker.pubkey());
ix.accounts[0].is_signer = false;
// signed by `stranger` only → must be Err
```

Without the signer check that transaction succeeds, and the escrow is
unwound back to its maker without the maker's consent. That is the
"annoying" case in the guide. Reading `cancel.rs` for the `is_signer` line
takes ten seconds and is worth doing on every submission, because the grader
can't see it and the guide's suite can't either.

**Common near-misses worth a comment rather than a rejection:**

- **Holding `Escrow::load_mut` across a CPI.** Fails at runtime with
  `AccountBorrowFailed`, so it never reaches a green suite. If a learner asks
  why their Take "does nothing", this is usually it.
- **Using `find_program_address` in Take/Cancel instead of `derive_address`
  with the stored bump.** Correct and passes everything. It costs a few
  thousand CU the guide explicitly says to avoid. Worth a comment.
- **Checking `maker_ata_b` or `taker_ata_a` before creating them.** Fails
  on a fresh taker, which the happy-path test catches. Checking
  `taker_ata_b` first is harmless, since it has to exist already.
- **Skipping the `mint_b` check in Take.** The tests here don't catch it,
  because every one uses the right mint. A taker could pay in a worthless
  mint B′ instead. When reading, look for `mint_b` compared against
  `escrow.mint_b()`.
- **Moving `amount_to_give` instead of `vault_amount`.** Identical in every
  test. See Take above for why it matters.
- **`MakeV2 => instructions::process_make_instruction(...)`.** Routing it to
  Make is not "explicitly rejected". The `errors` gate fails, and the note
  says `MakeV2 is routed to a handler instead of rejected`.
- **A new `unsafe` block.** The guide's definition of done says there should
  be none beyond `Escrow::load_mut`. The grader doesn't check this, so grep
  for it.
