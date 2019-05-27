'use strict';
module.exports = {
	startTimer() {
		return process.hrtime();
	},

	/**
     * @param {[number, number]} timer
     */
	stopTimer(timer) {
		const [s, ns] = process.hrtime(timer);
		return ((s * 1e9) + ns) / 1e6;
	}
};
