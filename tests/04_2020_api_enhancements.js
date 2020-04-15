const Promise = require('bluebird');
const chai = require('chai');
chai.should();

const { addDays, subDays } = require('date-fns');
const { name, address, phone, internet } = require('faker');
const CCRM = require('../client.js');
const ccrm = CCRM({ config: { url: 'https://staging.continuitycrm.com/api/' },  });

describe('Enhacements all function as expected', function() {
	let searchEmail = internet.email();
	let testOrderNumber;
	let testOrder;


	this.timeout(10000);

	const testCustData = {
		firstName: name.firstName(),
		lastName: name.lastName(),
		address1: address.streetAddress(),
		city: address.city(),
		postalCode: address.zipCode(),
		country: 'US',
		state: 'US-NY',
	};

	before(function() {
		this.timeout(10000);
		return Promise.try(() => {
			return ccrm.newOrder(
				{
					...testCustData,
					email: searchEmail,
					phone: phone.phoneNumber(),

				},
				[
					{
						productId: 2,
						quantity: 1,
					}
				],
				{
					...testCustData,
					creditCardType: 'mastercard',
					creditCardNumber: '4444444444444445',
					cvv: '123',
					expMonth: 1,
					expYear: 2025,
					shippingMethodId: 4
				}
			);
		}).then(res => {
			testOrderNumber = res.orderId;
			testOrder = res;
		});
	});

	describe('findOrder', function() {
		this.timeout(10000);

		it('should include OrderProduct information in Product list', () => {
			return ccrm.findOrder({
				orderView: true,
				fromDate: subDays(new Date(), 1),
				toDate: addDays(new Date(), 1),
				email: searchEmail
			}).then(([order]) => {
				order.orderProducts.forEach(orderProduct => {
					orderProduct.should.have.property('nextDate');
					orderProduct.should.have.property('nextProductId');
					orderProduct.should.have.property('billValue');
				});

				testOrder = order;
			});
		});
	});

	describe('updateOrder', function() {
		this.timeout(10000);

		it('can update an order\'s OrderProduct\'s nextDate and nextProductId', () => {
			return Promise.try(() => {
				return ccrm.patchOrderProducts(
					testOrderNumber,
					testOrder.orderProducts.map(orderProduct => {
						return {
							...orderProduct,
							nextDate: addDays(new Date(), orderProduct.billValue),
							nextProductId: 7,
						};
					})
				);
			});
		});
	});

	describe('cancelSubscription', function() {
		this.timeout(10000);

		it('can request stop billing on an order without sending optional OrderProduct data', () => {
			return ccrm.cancelSubscription(testOrderNumber);
		});
	});
});

