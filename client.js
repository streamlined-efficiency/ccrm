'use strict';
const debug = require('debug')('ccrm');
const fetch = require('node-fetch');
const FetchError = require('node-fetch').FetchError;
const Promise = require('bluebird');
const camelcaseKeys = require('camelcase-keys');
const pascalcaseKeys = require('pascalcase-keys');
const qs = require('querystring');
const { startTimer, stopTimer } = require('./timer');
const { CRMError, OperationalError } = require('./errors');

const NOOP = function () { /* do nothing */ };

/**
 * @typedef {{
 *    endpoint: string,
 *    requestBody: object,
 *    responseBody: object,
 *    latency: number,
 *    httpResponseCode: number,
 *    info?: string
 * }} Log
 * @typedef {function(Log): void} Logger
 * @typedef {{ url?: string, apiKey: string }} Config
 * @typedef {{ backupResponse: string } & FetchError } CustomFetchError
 */

/**
  * @typedef {{
		orderId: number,
		created: Date,
		isTest: boolean,
		isPrepaid: boolean,
		shipped: boolean,
		customerId: number,
		shippingFirstName: string
		shippingLastName: string
		shippingAddress1: string
		shippingAddress2: string | null,
		shippingCity: string
		shippingProvince: string
		shippingPostalCode: string
		shippingCountry: string
		phone: string
		email: string
		billingFirstName: string
		billingLastName: string
		billingAddress1: string
		billingAddress2: string | null,
		billingCity: string
		billingProvince: string
		billingPostalCode: string
		billingCountry: string
		shippingMethodId: number
		processorId: number | null,
		affiliateId: string,
		subId: string,
		chargebackDate: Date | null,
		parentId: number | null,
		status: number,
		ipAddress: string,
		subTotal: number,
		tax: number,
		shippingPrice: number,
		total: number,
		depth: number,
		orderProducts: Array<{
			productId: number
			quantity: number
			price: number
			productName: string
			currencyInIso4217Format: string
			currency: string
		}>
	}} OrderResponse
  */

const partialDataTransform = {
	firstName: 'FirstName',
	lastName: 'LastName',
	address1: 'Address1',
	address2: 'Address2',
	city: 'City',
	country: 'Country',
	state: 'Province',
	postalCode: 'PostalCode',
	phone: 'Phone',
	email: 'Email',
	affid: 'AffiliateId',
	sid: 'SubId',
	productId: 'ProductId',
	ip: 'IPAddress'
};

const customerDataTransform = {
	firstName: 'ShippingFirstName',
	lastName: 'ShippingLastName',
	address1: 'ShippingAddress1',
	address2: 'ShippingAddress2',
	city: 'ShippingCity',
	country: 'ShippingCountry',
	state: 'ShippingProvince',
	postalCode: 'ShippingPostalCode',
	phone: 'Phone',
	email: 'Email',
	affid: 'AffiliateId',
	sid: 'SubId',
	ip: 'IPAddress',
};

const paymentDataTransform = {
	firstName: 'BillingFirstName',
	lastName: 'BillingLastName',
	address1: 'BillingAddress1',
	address2: 'BillingAddress2',
	city: 'BillingCity',
	country: 'BillingCountry',
	state: 'BillingProvince',
	postalCode: 'BillingPostalCode',
	cvv: 'CreditCardCVV',
	creditCardType: 'PaymentType',
	creditCardNumber: 'CreditCardNumber',
	expMonth: 'CreditCardExpirationMonth',
	expYear: 'CreditCardExpirationYear',
	shippingMethodId: 'ShippingMethodId',
};

const paymentTypeMap = {
	'amex': 1,
	'discover': 2,
	'mastercard': 3,
	'visa': 4,
	'other': 5,
};

function transformKeys(obj, transform) {
	return Object.entries(obj).reduce((newObject, [key, value]) => {
		if (transform[key]) {
			return { ...newObject, [transform[key]]: value };
		} else {
			return { ...newObject, [key]: value };
		}
	}, {});
}

/**
 * @param {{ config: Config, logger?: Logger }} module.exports.$0
 */
module.exports = ({ config, logger = NOOP }) => {
	const { url = 'https://app.continuitycrm.com/api/', apiKey } = config;

	const HEADERS = {
		'Content-Type': 'application/json',
		APIKey: apiKey,
	};

	/**
     * @param {fetch.Response} response
     * @param {[number, number]} ccrmTimer
     */
	const checkStatus = (response, ccrmTimer, { data, endpoint }) => {
		if (response.status >= 200 && response.status < 300) {
			return Promise.resolve(response);
		}

		const ccrmResponseTime = stopTimer(ccrmTimer);

		return Promise.try(() => {
			const backup = response.clone();

			return Promise.try(() => {
				return response.json();
			}).catch((/** @type CustomFetchError */err) => {
				debug(`Error decoding JSON from response body: ${err.message}`);
				return backup.text()
					.then(d => {
						debug('Non-JSON response:', d);
						err.backupResponse = d;
						throw err;
					});
			});
		}).tap((json) => {
			logger({
				endpoint,
				requestBody: data,
				responseBody: json,
				latency: ccrmResponseTime,
				httpResponseCode: response.status,
			});
		}).then((json) => {
			const msg = Object.prototype.hasOwnProperty.call(json, 'ModelState') ?
				Object.values(json)[0] :
				response.statusText;
			const error = new CRMError(msg, {
				statusCode: response.status,
				requestBody: data,
				responseBody: json,
			});

			if (response.status === 402) error.name = 'OrderDecline';

			throw error;
		}).catch(FetchError, (/** @type CustomFetchError */err) => {
			logger({
				endpoint,
				info: `FetchError:  ${err.message}`,
				requestBody: data,
				responseBody: { bogusResponse: err.backupResponse },
				latency: ccrmResponseTime,
				httpResponseCode: response.status,
			});

			throw new OperationalError(err.backupResponse, {
				statusCode: response.status,
				requestBody: data,
				responseBody: { bogusResponse: err.backupResponse },
			});
		});
	};

	const getJSON = (endpoint, data = {}, method = 'POST') => {
		const opts = {
			method,
			body: method.toUpperCase() === 'POST' ? JSON.stringify(data) : undefined,
			headers: HEADERS,
		};

		const queryparams = method.toUpperCase() === 'GET' ? `?${qs.stringify(data)}` : '';

		debug('request: ', data, opts);

		const ccrmTimer = startTimer();
		return Promise.try(() => {
			// @ts-ignore checkJs is confused about requiring a cjs module with esm defs
			return fetch(`${url}${endpoint}${queryparams}`, opts);
		}).then((res) => {
			return checkStatus(res, ccrmTimer, { data, endpoint });
		}).then((res) => {
			const backup = res.clone();

			debug('status: ', res.status);
			return Promise.try(() => {
				return res.json();
			}).tap((json) => {
				debug('response: ', json);
				const ccrmResponseTime = stopTimer(ccrmTimer);
				logger({
					endpoint,
					requestBody: data,
					responseBody: json,
					latency: ccrmResponseTime,
					httpResponseCode: res.status,
				});
			}).catch((err) => {
				debug(`Error decoding JSON from response body: ${err.message}`);
				return backup.text()
					.then(d => debug('Non-JSON response:', d))
					.then(() => { throw err; });
			});
		}).then((orderData) => {
			if (typeof orderData === 'object') {
				if (Array.isArray(orderData)) {
					if (typeof orderData[0] === 'object') {
						return orderData.map(order => camelcaseKeys(order, {deep: true}));
					} else {
						return orderData;
					}
				} else {
					return camelcaseKeys(orderData, {deep: true});
				}
			} else {
				return orderData;
			}
		});
	};

	/**
	 * @typedef {{
		firstName: string
		lastName: string
		address1: string
		address2?: string
		city: string
		country: string
		state: string
		postalCode: string
		phone: string
		email: string
		affid?: string
		sid?: string
		productId: number
		ip?: string
	 * }} PartialData
	 * @param {PartialData} partialPayload
	 */

	const newPartial = (partialPayload) => {
		const endpoint = 'partials';

		const partialData = transformKeys(partialPayload, partialDataTransform);
		return getJSON(endpoint, partialData);
	};

	function calculateRebillDiscount(product) {
		const { promoPrice, ...newProduct } = product;

		newProduct.rebillDiscount = (Math.ceil(newProduct.price * 100) - Math.ceil(promoPrice * 100)) / 100;
		newProduct.discountCycleCount = newProduct.discountCycleCount || 1;

		return newProduct;
	}

	/**
     * @typedef {{
        firstName: string
        lastName: string
        address1: string
        address2?: string
        city: string
        country: string
        state: string
        postalCode: string
		phone: string
		email: string
        affid?: string
        sid?: string
        ip?: string
     * }} CustomerData
     *
     * @typedef { Array<{
		productId: number | string
		quantity: number | string
		price?: number | string
		promoPrice?: number | string
		rebillDiscount?: number | string
		discountCycleCount?: number | string
	 * }>} ProductData
     *
     * @typedef {{
        firstName: string
        lastName: string
        address1: string
        address2?: string
        city: string
        country: string
        state: string
        postalCode: string
        cvv: string
        creditCardType: 'americanExpress' | 'discover' | 'mastercard' | 'visa' | 'other'
        creditCardNumber: string
        expMonth: number
		expYear: number
		shippingMethodId: number
     * }} PaymentData

     * @param {CustomerData} customer
     * @param {ProductData} products
     * @param {PaymentData} payment
     */
	const newOrder = (customer, products, payment) => {
		const endpoint = 'orders';

		const transformedProducts = products.map((product) => {
			if (product.promoPrice && !product.rebillDiscount) {
				return calculateRebillDiscount(product);
			} else {
				return product;
			}
		});

		const customerData = transformKeys(customer, customerDataTransform);
		const paymentData = {
			...transformKeys(payment, paymentDataTransform),
			OrderProducts: transformedProducts.map(pascalcaseKeys),
			PaymentType: paymentTypeMap[payment.creditCardType]
		};

		return getJSON(endpoint, { ...customerData, ...paymentData });
	};

	/**
	 *
	 * @param {string | number} partialId
	 * @param {ProductData} products
	 * @param {PaymentData} payment
	 */
	const newOrderOnPartial = (partialId, products, payment) => {
		const endpoint = `partials/order/${partialId}`;
		const paymentData = {
			...transformKeys(payment, paymentDataTransform),
			OrderProducts: products.map(pascalcaseKeys),
			PaymentType: paymentTypeMap[payment.creditCardType]
		};

		return getJSON(endpoint, paymentData);
	};

	/**
	 *
	 * @param {string | number} orderId
	 * @param {ProductData} upsell
	 */
	const upsellOnOrder = (orderId, upsell) => {
		const endpoint = `orders/upsell/${orderId}`;
		const upsellData = {
			OrderProducts: upsell.map(pascalcaseKeys),
		};
		return getJSON(endpoint, upsellData);
	};

	/**
	 * @param {{
		fromDate: Date
		toDate: Date
		status?: number
		productId?: number
		orderId?: number
		affiliateId?: string
		customerId?: number
		shipped?: boolean
		address?: string
		address2?: string
		firstName?: string
		lastName?: string
		subId?: string
		email?: string
		city?: string
		zip?: string
		phone?: string
		state?: string
		country?: string
		transactionId?: string
		rma?: string
		ip?: string
		depth?: number
		bin?: number,
		lastFour: number,
		orderView?: boolean
	 * }} options
	 * @returns {Promise<OrderResponse[]>}
	 */
	const findOrder = (options) => {
		const endpoint = 'orders/find';
		return getJSON(endpoint, {
			...options,
			depth: 0,
			toDate: options.toDate.toISOString(),
			fromDate: options.fromDate.toISOString(),
		}, 'GET');
	};

	const getOrder = (orderId) => {
		const endpoint = `orders/${orderId}`;
		return getJSON(endpoint, null, 'GET');
	};

	const getProvinces = (country) => {
		const endpoint = `orders/getProvinces/${country}`;

		return getJSON(endpoint, null, 'GET');
	};

	const getTaxForProduct = (productId, shippingCountry) => {
		const endpoint = 'products/calculateTaxForProduct';

		return getJSON(endpoint, { ProductId: productId, ShippingCountry: shippingCountry.toUpperCase() }, 'GET');
	};

	return { newPartial, newOrder, newOrderOnPartial, upsellOnOrder, findOrder, getOrder, getProvinces, getTaxForProduct };
};
