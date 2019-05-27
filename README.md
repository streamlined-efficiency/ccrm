# ccrm
Node.js library for interacting with Continuity CRM API

## Use
Install from npm:
```
npm install --save ccrm
```

The export of this package is a function that takes a single argument of an object with a required `config` prop and an optional `logger` prop. The config is defined as: `{ url?: string, apiKey: string }`. The `url` is optional in the sense that the default cloud hosted instance of CCRM does not require it. The API key must be provided. Example:

```js
const CCRM = require('ccrm');

const ccrm = CCRM({ apiKey: '11111-1111-1111-1111' });
```

`ccrm` is now a configured instance of the transport client.

## Functions
#### *`newPartial(partialPayload: PartialData) => Promise<OrderResponse>`*
`newPartial` takes a single argument of type `PartialData`, defined as:

```ts
{
    productId: number
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
}
```

and returns a Promise that resolves to the CRM response data (but camel-cased, for your convenience). The important part of the response object is the `partialId` prop, which contains the id of the partial / prospect for you to save to your application for later use.

#### *`newOrder(customer: CustomerData, products: ProductData, payment: PaymentData) => Promise<OrderResponse>`*
`newOrder` takes three arguments in order of their types, defined as:

```ts
CustomerData {
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
}

ProductData Array<{
    quantity: number | string,
    price: number | string,
    productId: number | string
}>

PaymentData {
    firstName: string
    lastName: string
    address1: string
    address2?: string
    city: string
    country: string
    state: string
    postalCode: string
    cvv: string
    creditCardType: string
    creditCardNumber: string
    expMonth: number
    expYear: number
    shippingMethodId: number
} PaymentData
```

and returns a Promise that resolves to the CRM response data (but camel-cased, for your convenience). See example response data:

```json
{
  "orderId": 1,
  "prepaid": true,
  "total": 5.00,
  "shippingPrice": 4.00,
  "descriptor": "acmecofoo8888888888",
  "customerServiceNumber": "8888888888",
  "ipAddress": "0.0.0.0",
  "subTotal": 8.00,
  "tax": 9.00,
  "transactionResponse": "sample string 10",
  "orderProducts": [
    {
      "productId": 1,
      "price": 2.0,
      "ProductName": "sample string 3"
    },
    {
      "productId": 1,
      "price": 2.0,
      "productName": "sample string 3"
    }
  ]
}
```

#### *`newOrderOnPartial(partialId: string | number, products: ProductData, payment: PaymentData) => Promise<OrderResponse>`*
`newOrderOnPartial` takes three arguments - the `partialId` on which to place the order, and then the `ProductData` and `PaymentData`, as previously defined above (see the `newOrder` function definition). The response is also nearly identical to the `newOrder` response as well. The main difference is you provide the `partialId` in lieu of the full set of customer data.

#### *`upsellOnOrder(orderId: string | number, products: ProductData) => Promise<OrderResponse>`*
`upsellOnOrder` is similar to the previous functions, but takes only an existing `orderId` plus a new `ProductData` array. No customer data or payment data is needed, as the data saved from the previous order is reused. The response data is also nearly identical to the `newOrder` response.


