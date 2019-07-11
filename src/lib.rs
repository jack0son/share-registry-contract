use std::error::Error;
use std::collections::HashMap;
use std::fmt;

use smart_contract::payload::Parameters;
use smart_contract::log;
use smart_contract::transaction::{Transaction, Transfer};
use smart_contract_macros::smart_contract;


pub type Address = [u8; 32];

pub struct Holder(String);

pub struct Registry {
    // wallet address => holder details, balance, purchase round idx
    pub holders: HashMap<Address, (Holder, u64, u64)>,
    pub supply: u64, 
    pub price: u8,
    pub min_parcel: u64,
}

fn dummy_kyc(sender: &Address, holder: &Holder) -> bool {
    // Call out to KYC contract goes here
    // All holder details should be held in seperate identity service
    true
}

fn give_change(sender: &Address, amount: u64) -> Result<(), Box<dyn Error>> {
    // Private function
    Transfer {
        destination: *sender,
        amount: amount,
        func_name: vec![],
        func_params: vec![],
    }
    .send_transaction();

    Ok(())
}

const COOL_OFF_ROUNDS: u64 = 5; // number of rounds before investment confirmed

#[smart_contract]
impl Registry {
    fn init(params: &mut Parameters) -> Self {
        /*
        let supply = params.read();
        let price = params.read();  // Price per share
        let min_parcel = params.read();
        */
        let holders = HashMap::new();
        let supply: u64 = 1000;
        let price: u8 = 10;  // Price per share
        let min_parcel: u64 = 1; 

        Registry {
            holders,
            supply,
            price,
            min_parcel,
        }
    }

    fn purchase(&mut self, params: &mut Parameters) -> Result<(), Box<dyn Error>> {
        let holder = Holder(params.read());

        if self.supply == 0 {
            return Err(Box::new(RegistryError::SaleComplete));
        }

        if !dummy_kyc(&params.sender, &holder) { 
            return Err(Box::new(RegistryError::FailedKYC));
        }

        // Check minimum parcel size is met
        let mut num_shares = params.amount / self.price as u64; // truncate decimal
        if num_shares < self.min_parcel {
            return Err(Box::new(RegistryError::ParcelSizeNotMet));
        }

        if num_shares > self.supply {
            num_shares = self.supply; // issue remaining shares
        }

        // Allocate shares
        let (_, balance, idx) = self.holders.entry(params.sender)
            .or_insert( (holder, 0, 0) );

        self.supply -= num_shares;
        *balance += num_shares;
        *idx = params.round_idx;

        // Return unspent Perls to the purchaser
        let change = params.amount - (num_shares * self.price as u64);
        if change > 0 {
            //return give_change(&params.sender, change);
            return Ok(());
        }

        Ok(())
    }

    fn cancel_purchase(&mut self, params: &mut Parameters) ->  Result<(), Box<dyn Error>> {
        if let Some((_, balance, purchase_idx)) = self.holders.get_mut(&params.sender) {
            if *purchase_idx + COOL_OFF_ROUNDS < params.round_idx {
                return Err(Box::new(RegistryError::OutsideCoolOff));
            }

            self.supply += *balance;
            *balance = 0; //@fix: must use last purchase amount, not balance
            *purchase_idx = 0;

            return Ok(())
        }

        Err(Box::new(RegistryError::NoSuchHolder))
    }

    fn transfer(&mut self, params: &mut Parameters) -> Result<(), Box<dyn Error>> {
        let sender: Address = params.sender;
        let recipient: Address = params.read();
        let r_holder = Holder(params.read());
        let amount: u64 = params.read();

        // Check recipient is registered with KYC
        if !dummy_kyc(&recipient, &r_holder) { 
            return Err(Box::new(RegistryError::FailedKYC));
        }

        // Get, check, and update sender's holdings
        if let Some((s_holder, s_balance, purchase_idx)) = self.holders.get_mut(&sender) {
            if *purchase_idx + COOL_OFF_ROUNDS > params.round_idx {
                return Err(Box::new(RegistryError::InsideCoolOff));
            }

            if *s_balance < amount {
                return Err(Box::new(RegistryError::InsuffBalance));
            }

            *s_balance -= amount;
        }

        // Update or instantiate recipient's balance
        let (_, r_balance, _) = self.holders.entry(recipient)
            .or_insert((r_holder, 0, 0));

        *r_balance += amount;

        Ok(())
    }

    fn get_holders(&mut self, params: &mut Parameters) ->  Result<(), Box<dyn Error>> {
        let mut holders = Vec::new();

        for (h_id, h) in &self.holders {
            holders.push(format!("<{}>: {},  {} shares,  Rnd:{}", 
                                      to_hex_string(h_id), (h.0).0, h.1, h.2));

        }
        log(&holders.join("\n"));

        Ok(())
    }
}

#[derive(Debug, Clone)]
enum RegistryError {
    FailedKYC,	        // Wallet address not identified
        NoSuchHolder,       // Holder does not exist
        ParcelSizeNotMet,   // Attempt to purchase parcel of shares less than minumum
        OutsideCoolOff,     // Attempt to cancel investment after cool off period
        InsideCoolOff,      // Attempt to transfer within cool off period
        InsuffBalance,      // Insufficient shares for transfer
        SaleComplete,       // Attempt investment after issuance completed
        CustomError(String),
}

impl Error for RegistryError {}

impl fmt::Display for RegistryError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match *self {
            RegistryError::FailedKYC => write!(f, "Purchaser failed KYC check."),
            RegistryError::NoSuchHolder => write!(f, "Attempted action on unknown holder."),
            RegistryError::ParcelSizeNotMet => write!(f, "Payment too small for minimum share purchase."),
            RegistryError::OutsideCoolOff => write!(f,"Cool-off expired: cannot cancel purchase."),
            RegistryError::InsideCoolOff => write!(f,"Inside cool-off period: cannot purchase."),
            RegistryError::SaleComplete => write!(f, "Sale is over."),
            RegistryError::InsuffBalance => write!(f, "Sender does not have enough shares."),
            RegistryError::CustomError(ref cause) => write!(f, "Error: {}", cause),
        }
    }
}

fn to_hex_string_abridge(bytes: &[u8]) -> String {
    to_hex_string(&[&bytes[..4], &bytes[bytes.len()-4..]].concat())
}

fn to_hex_string(bytes: &[u8]) -> String {
    let strs: Vec<String> = bytes.iter()
        .map(|b| format!("{:02x}", b))
        .collect();
    strs.join("")
}
