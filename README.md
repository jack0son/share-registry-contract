# Share Registry Contract

A Wavelet smart contract that implements share purchase and issuance as
a simple association of addresses to balances and names.

Implemented to begin learning development of Wavelet contracts using Rust.

*Contraints*
 * _Minimum parcel size_: Purchaser must request a minimum amount of shares to
   participate in the sale
 * _Dummy KYC_:	Check all potential holders (sale or transfer) against a KYC
   service - a function that returns true.
 * _Cool-off Period_: Investors can cancel their purchase within a fixed number
   of rounds following the purchase.

## Spawn

## Issues
 - [ ] Supply should be checked as invariant
 - [ ] Should only be allowed one investment inside cool-off
 - [ ] Safe balance updates using `HashMap.get()` and `.insert()`, instead of `.or_insert()`
 - [ ] Cancelling investment reverses all parcels purchased
 - [ ] Cool-off period set at spawn
 - [ ] Price increases in tranches as round\_idx increases and remaining supply decreases

