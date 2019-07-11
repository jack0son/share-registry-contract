const {dv} = require('./common');

const debug = {
	m: require('debug')('et:m'),		// main
	h: require('debug')('et:h'),		// helpers
	err: require('debug')('et:err'),// errors
	v: dv,													// verbose
}

module.exports = debug;
