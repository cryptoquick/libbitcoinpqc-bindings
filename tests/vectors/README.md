# Algorithm test vectors

Canonical home for **tapscript signature algorithm** golden vectors used across
Rust, Python, Node, WASM, and C (libbitcoinpqc) tests.

This is separate from **BIP-360 P2MR construction** vectors under
[`p2mr/`](p2mr/) (script trees / control blocks).

## Layout

```
tests/vectors/
  fixtures/     # canonical JSON (source of truth for algorithms)
  rust/         # generated *.rs
  python/       # generated *_golden_vectors.py
  nodejs/       # generated *.js + *.d.ts
  wasm/         # generated *.js
  p2mr/         # living P2MR construction vectors (not from this sync script)
```

## Algorithms

| Fixture | Algorithms / note |
|---------|-------------------|
| `fixtures/secp256k1_bip340_row0.json` | BIP-340 row 0 Schnorr |
| `fixtures/ml_dsa_44_golden.json` | ML-DSA-44 |
| `fixtures/slh_dsa_sha2_golden_vectors.json` | SLH-DSA-SHA2-128s |

## Regenerate

```bash
make sync-vectors
# or (forces C headers into the submodule; preferred before commit):
just vectors-in-sync
```

[`scripts/sync-golden-vectors.py`](../../scripts/sync-golden-vectors.py) fans out
to language artifacts and regenerates
`libbitcoinpqc/tests/vectors/*.h` (generated only).

## BIPs handoff

Algorithm e2e and golden vectors for BIP-360 tapscript signature algorithms live
here (bindings repo), not in the BIPs tree. See also
[bitcoin/bips#2202](https://github.com/bitcoin/bips/pull/2202) and
[`p2mr/README.md`](p2mr/README.md) for construction vectors preserved from that PR.
