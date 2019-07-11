//const {Wavelet, Contract, TAG_TRANSFER} = require('wavelet-client');
const {Wavelet, Contract, TAG_TRANSFER} = require('/home/jackson/Repositories/github/jgitgud/wavelet-client-js');
const JSBI = require('jsbi');
const BigInt = JSBI.BigInt;
const fs = require('fs');
const {inspect} = require('util');
const debug = require('./debug/main.js');
const chalk = require('chalk');

const client = new Wavelet("http://127.0.0.1:9000");

(async () => {
	// Appropriate the node's funds
	const nodeWallet = Wavelet.loadWalletFromPrivateKey('87a6813c3b4cf534b6ae82db9b1409fa7dbd5c13dba5858970b56084c4a930eb400056ee68a7cc2695222df05ea76875bc27ec6e61e8e62317c336157019c405');
	const nodeAccount = await getAccount(client, nodeWallet.publicKey);
	await showBalance(client, nodeWallet);
	const amount = JSBI.subtract(BigInt(nodeAccount.balance), BigInt(100000000));

	const wallet = Wavelet.generateNewWallet();
	const account = await getAccount(client, wallet.publicKey);
	await transfer(client, nodeWallet, wallet.publicKey, 
		JSBI.divide(BigInt(amount), BigInt(2)), 
		JSBI.divide(BigInt(amount), BigInt(4)),
	);

	showBalance(client, wallet);

	// Set up async tx logger to confirm promise based tx events are arriving
	let nodeInfo = await client.getNodeInfo();
	const txl = await getTxLogger(client, {creator: account.public_key}, nodeInfo.round.depth);

	// Donate perls to some new wallets
	let wallets = Array(3).fill({}).map(o => Wavelet.generateNewWallet());
	const gasLimit = JSBI.subtract(BigInt(account.balance), BigInt(10000000));

	const gift = BigInt(1000000);
	//await Promise.all(wallets.map(w => (transfer(client, wallet, Buffer.from(w.publicKey).toString("hex"), BigInt(gift), gasLimit))));
	await Promise.all(wallets.map(w => (transfer(client, wallet, w.publicKey, gift, gasLimit))));

	try {
		// Deploy share registry contract
		const reg = new ShareRegistry('../target/wasm32-unknown-unknown/release/share_reg.wasm');
		const sgl = JSBI.subtract(gift, JSBI.divide(gift, BigInt(2)));
		await reg.deploy(client, wallet, sgl)

		// Send a number of purchase transactions
		await Promise.all(wallets.map(w => (reg.purchase(w, 'jim_' + wallets.indexOf(w), 100, sgl))));// fails due to gas limit too small

		let holders = await reg.get_holders();
		debug.m(`Holders:\n${holders}`);

	} catch (e) {
		console.log(e);
	}

	return process.exit(0)

})();

// @param {{id: string|undefined, tag: number|undefined, sender: string|undefined, creator: string|undefined}} opts
// @param {number} timeout time until reject
// @returns {Promise<tx_event>}
function waitNextTx(client, opts = {}, timeout = 10000) {
	return new Promise((resolve, reject) => {
		const callbacks = {
			onTransactionApplied: resolve,
			onTransactionRejected: reject,
		};
	
		client.pollTransactions(callbacks, opts);

		if(timeout !== undefined) {
			setTimeout(() => {
				reject(`Timeout on tx wait with opts ${inspect(opts)}`);
			}, timeout);
		}
		/* WebSocket example response object
		 { 
				mod: 'tx',
				event: 'applied',
				tx_id: 'bacad086df44ffeba28ce7c4f6487b3c34263c4ebf86c3a679b7621fe60c9487',
				sender_id: '400056ee68a7cc2695222df05ea76875bc27ec6e61e8e62317c336157019c405',
				creator_id: '400056ee68a7cc2695222df05ea76875bc27ec6e61e8e62317c336157019c405',
				depth: 1979,
				tag: 2,
				time: '2019-07-10T12:04:00+09:30' 
		 }
		*/
	});
}

// @param {number} pruneDepth ignore events with depth lower than prune depth
// @returns websocket client
async function getTxLogger(client, opts = {}, pruneDepth = 0) {
	const log = d => {
			if(d.depth > pruneDepth)
				debug.m(`async_logger: ${d.event} ${tagString[d.tag]}:<${abridge(d.tx_id)}> created by <${abridge(d.creator_id)}> at depth ${d.depth}`);
	};

	return await client.pollTransactions({
		onTransactionApplied: log,
		onTransactionRejected: log,
	}, opts);
}

async function getAccount(client, publicKey) {
	if(typeof publicKey !== "string") {
		publicKey = Buffer.from(publicKey).toString("hex")
	}
	return await client.getAccount(publicKey);

}

async function transfer(client, wallet, recipient, amount, gasLimit) {
	const t = await client.transfer(wallet, recipient, amount);
	debug.h(`Transfer ${chalk.yellow('pending')} at tx ID <${abridge(t.tx_id)}> ...`)

	try {
		const resp = await waitNextTx(client, {id: t.tx_id});
		debug.h(`... transfer ${chalk.green('confirmed')} <${abridge(t.tx_id)}>:${tagString[resp.tag]} was ${resp.event}`);
	} catch(e) {
		debug.err(e);
	}
}

// Scuba syntax ShareRegsitry extends contract
// Check out truffle syntax
class ShareRegistry {
	constructor(path) {
		this.path = path || './share_reg.wasm';
		this.price = 10;
		this.initialised = false
		this.responses
	}

	async deploy(client, wallet, gasLimit) {
		const self = this;
		// Deploy contract to node
		self.code = await readBinary(self.path);
		const params = {}; // share price, supply, cool-off period
		//self.address  = (await client.deployContract(wallet, self.code, gasLimit, {})).tx_id;
		const txd  = await client.deployContract(wallet, self.code, gasLimit, {});
		self.address = txd.tx_id;
		debug.c(`Deployment ${chalk.yellow('pending')} at tx ID <${abridge(self.address)}> ...`)

		// Wait for transaction confirmation
		const resp = await waitNextTx(client, {id: self.address});
		debug.c(`... deployment ${chalk.green('confirmed')} <${abridge(resp.tx_id)}>:${tagString[resp.tag]} was ${resp.event}`);

		// Initialise Local contract VM
		self.contract = new Contract(client, self.address); 
		await self.contract.init();
		debug.c("... contract: initialised local VM")
		if(!sameBinary(self.code, self.contract.code)) {
			 throw new Error('WASM binary mismatch');
		}

		const {contract_id, contract_payload_buf} = self.contract;
		debug.c(`Loaded contract data at <${abridge(contract_id)}>`)//, payload_len: contract_payload_buf.length}}`);

		self.client = client;
	}

	async purchase(wallet, name, numShares, gasLimit) {
		const self = this;
		const price = 10;
		const supply = 1000;
		const min_parcel = 1;

		const amount = numShares * price;
		try {
			const call = await this.contract.call(wallet, 'purchase', BigInt(amount), gasLimit,
				{
					type: 'string',
					value: name,
				});
			// Fetch Tx details
			//const callTx = await self.client.getTransaction(call.tx_id);
			//const txDetails = Wavelet.parseTransaction(callTx.tag, callTx.payload);
			//await getTxLogger(self.client, {id:call.tx_id});

			debug.c(`Purchase call ${chalk.yellow('pending')} at tx ID <${abridge(call.tx_id)}> ...`)
			const resp = await waitNextTx(self.client, {id: call.tx_id});
			debug.c(`... call ${chalk.green('confirmed')} <${abridge(resp.tx_id)}>:${tagString[resp.tag]} was ${resp.event}`);

		} catch (e) {
			debug.err(e);
		}
	}

	async get_holders() {
		try {
			await this.contract.fetchAndPopulateMemoryPages();
			return (this.contract.test('get_holders', BigInt(0)).logs);
		} catch(e) {
			debug.err('Failed to get holders', e);
		}
	}
}

async function sendTxAndWait(params, tx = () => {}) {
	// 1. keed params to arbitrary transactional client function
	
	// 2. wait on response
	//return waitForTx();
}

async function showBalance(client, wallet) {
	let account = await getAccount(client, wallet.publicKey);
	debug.h(`Genesis account <${account.public_key}> has balance ${account.balance}`);
}

const tagString = {
	0: "NOP",
	1: "TRANSFER",
	2: "CONTRACT",
	3: "STAKE",
	4: "BATCH"
};

const sameBinary = (a, b) => {
	return Buffer.compare(a,b) ? false : true;
}

const readBinary = (fname) => {
	return new Promise((resolve, reject) => {
		fs.readFile(fname, (err, data) => {
			if(err) reject(err);
			resolve(data);
		});
	});
}

const abridge = (str) => {
	return str.slice(0, 8).concat("...", str.slice(str.length - 8, str.length))
}

// Questions:
//	- what is a parent ID?
//	- cannot use reject resolve structure for tx wait
//				- when does reject even occur (check websocket api)
//				- appears to be a bug - rejection in node logs but no reject event
//				recieved
/*	
	e.g. »»» ztransfer: transactions to non-contract accounts should not specify gas limit or function names or params
	could not apply transfer transaction: transfer: transactions to non-contract accounts should not specify gas limit or function names or params
	6:16PM DBG Pruned away round and transactions. current_round_id: 60 event: prune num_tx: 431 pruned_round_id: 30


	ztransfer: b160f4cbe6916d2dbeb94047545ce2868897c8b2c7bad63cfd90200aeaa6be5d attempted to claim a gas limit of 9999999999998584256 PERLs, but only has 9998 PERLs
could not apply transfer transaction: transfer: b160f4cbe6916d2dbeb94047545ce2868897c8b2c7bad63cfd90200aeaa6be5d attempted to claim a gas limit of 9999999999998584256 PERLs, but only has 9998 PERLs

*/
