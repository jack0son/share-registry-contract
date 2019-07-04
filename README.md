# Share Registry Contract

A Wavelet smart contract that implements share purchase and issuance as
a simple token balance linked to a name.

Implemented to begin learning development of Wavelet contracts using Rust.

_Contraints_
 * Minimum parcel size: Purchaser must request a minimum amount of shares to
   participate in the sale
 * Dummy KYC:	Check all potential holders (sale or transfer) against a KYC
   service - a function that returns true.
 * Cool-off Period: Investors can cancel their purchase within a fixed number
   of rounds following the purchase.

## Spawn

## Issues
 - [ ] Supply should be checked as invariant
 - [ ] Should only be allowed one investment inside cool-off
 - [ ] Safe balance updates using `HashMap.get()` and `.insert()`, instead of `.or_insert()`
 - [ ] Cancelling investment reverses all parcels purchased

