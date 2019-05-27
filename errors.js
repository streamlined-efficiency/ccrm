'use strict';
const createError = require('create-error');

const composeError = (errName, errProps) => {
	const errorProps = { isCustomError: true, severity: 'error' };
	return createError(errName, Object.assign(errorProps, errProps));
};

module.exports = {
	CRMError: composeError('CRMError', { statusCode: 400 }),
	OperationalError: composeError('OperationalError', { statusCode: 500 }),
};
