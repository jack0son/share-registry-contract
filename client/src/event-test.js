const {Wavelet, Contract, TAG_TRANSFER} = require('/home/jackson/Repositories/github/jgitgud/wavelet-client-js');
//const {Wavelet, Contract, TAG_TRANSFER} = require('wavelet-client-js');
const JSBI = require('jsbi');
const BigInt = JSBI.BigInt;
const fs = require('fs');
const debug = require('./debug/event-test.js');

// Debug modules

const client = new Wavelet("http://127.0.0.1:9000");

(async () => {
	// Load genesis wallet
	const wallet = Wavelet.loadWalletFromPrivateKey('87a6813c3b4cf534b6ae82db9b1409fa7dbd5c13dba5858970b56084c4a930eb400056ee68a7cc2695222df05ea76875bc27ec6e61e8e62317c336157019c405');
	const account = await getAccount(client, wallet.publicKey);
	showBalance(client, wallet);

	// Set up async tx logger to confirm promise based tx events are arriving
	let nodeInfo = await client.getNodeInfo();
	debug.v('Node info'); debug.v(nodeInfo);

	// Logger on genesis wallet will polute logs 
	//const txl = await getTxLogger(client, {creator: account.public_key}, nodeInfo.round.depth);

	// Donate perls to some new wallets
	let wallets = Array(3).fill({}).map(o => Wavelet.generateNewWallet());
	const gasLimit = JSBI.subtract(BigInt(account.balance), BigInt(10000000));

	const gift = 1000000;
	//await Promise.all(wallets.map(w => (transfer(client, wallet, Buffer.from(w.publicKey).toString("hex"), BigInt(gift), gasLimit))));
	await Promise.all(wallets.map(w => (transfer(client, wallet, w.publicKey, BigInt(gift), gasLimit))));

	// Transfer from new wallet
	const txl = await getTxLogger(client, {creator: Buffer.from(wallets[0].publicKey).toString("hex")}, nodeInfo.round.depth);
	await transfer(client, wallets[0], wallets[1].publicKey, BigInt(gift/2), BigInt(gift/4))

})();

// @param {number} pruneDepth ignore events with depth lower than prune depth
// @returns websocket client
async function getTxLogger(client, opts = {}, pruneDepth = 0) {
	const log = d => {
			if(d.depth > pruneDepth)
				debug.m(`... ${d.event} tx <${abridge(d.tx_id)}> created by <${abridge(d.creator_id)}> at depth ${d.depth}`);
	};

	return await client.pollTransactions({
		onTransactionApplied: log,
		onTransactionRejected: log,
	}, opts);
}

// @param {{id: string|undefined, tag: number|undefined, sender: string|undefined, creator: string|undefined}} opts
function waitNextTx(client, opts = {}) {
	return new Promise((reject, resolve) => {
		const callbacks = {
			onTransactionApplied: reject,
			onTransactionRejected: resolve,
		};
	
		client.pollTransactions(callbacks, opts);
	});
}

async function transfer(client, wallet, recipient, amount, gasLimit) {
	const t = await client.transfer(wallet, recipient, amount);
	debug.m(`Transfer pending at tx ID <${abridge(t.tx_id)}> ...`)

	const resp = await waitNextTx(client, {id: t.tx_id});
	debug.m(`... tx<${abridge(t.tx_id)}>: ${tagString[resp.tag]} was ${resp.event}`);
}

async function getAccount(client, publicKey) {
	if(typeof publicKey !== "string") {
		publicKey = Buffer.from(publicKey).toString("hex")
	}
	return await client.getAccount(publicKey);

}

async function showBalance(client, wallet) {
	let account = await getAccount(client, wallet.publicKey);
	debug.m(`Genesis account <${account.public_key}> has balance ${account.balance}`);
}

const tagString = {
	0: "TAG_NOP",
	1: "TAG_TRANSFER",
	2: "TAG_CONTRACT",
	3: "TAG_STAKE",
	4: "TAG_BATCH"
};

const abridge = (str) => {
	return str.slice(0, 8).concat("...", str.slice(str.length - 8, str.length))
}
