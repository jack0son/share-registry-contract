
const supportsColor = require('supports-color');
const {inspect} = require('util');
const verbose = require('debug')('verbose');
const chalk = require('chalk');
const dv = (str, d=null) => verbose(chalk.green(inspect(str, {depth: d})));
const blog = (str, d=null) => console.log(chalk.blue(inspect(str, {depth: d})));

module.exports = {dv, verbose, blog};
