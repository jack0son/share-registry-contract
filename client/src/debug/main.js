// Replace d<module initial> converntion with d.<module> (debug.main)
const {dv} = require('./common');

const debug = {
	m: require('debug')('m:m'),		// main
	c: require('debug')('m:contract'),		// main
	h: require('debug')('m:h'),		// helpers
	err: require('debug')('m:err'),// errors
	v: dv,													// verbose
}

module.exports = debug;
