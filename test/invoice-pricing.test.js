var test = require('node:test');
var assert = require('node:assert/strict');

var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var tax = require('../lib/tax');

test('CURRENT BEHAVIOUR: checkout applies HSN GST and coupon to subtotal before tax', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 2 },
    { id: 2, name: 'Tea', hsn: '0902', price: 100, qty: 1 }
  ];

  var totals = pricing.computeTotals(items, 'WELCOME');

  assert.deepEqual(totals, {
    subtotal: 300,
    discount: 15,
    taxable: 285,
    tax: 26.6,
    cgst: 13.3,
    sgst: 13.3,
    total: 311.6,
    lines: [
      { id: 1, name: 'Rice', hsn: '1006', gstPercent: 5, gross: 200, discount: 10, taxable: 190, tax: 9.5, net: 199.5 },
      { id: 2, name: 'Tea', hsn: '0902', gstPercent: 18, gross: 100, discount: 5, taxable: 95, tax: 17.1, net: 112.1 }
    ]
  });
});

test('invoice figures match checkout totals and HSN line tax', function () {
  var order = {
    id: 41,
    items: [
      { id: 1, name: 'Rice', hsn: '1006', price: 200, qty: 1 },
      { id: 2, name: 'Tea', hsn: '0902', price: 100, qty: 1 }
    ],
    coupon: 'WELCOME',
    subtotal: 300,
    discount: 15,
    tax: 26.6,
    total: 311.6
  };

  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(figures, {
    subtotal: 300,
    discount: 15,
    tax: 26.6,
    cgst: 13.3,
    sgst: 13.3,
    total: 311.6,
    rows: [
      { name: 'Rice', sku: '-', hsn: '1006', qty: 1, price: 200, gstPercent: 5, line: 200, lineTax: 9.5 },
      { name: 'Tea', sku: '-', hsn: '0902', qty: 1, price: 100, gstPercent: 18, line: 100, lineTax: 17.1 }
    ]
  });
  assert.equal(figures.total, order.total);

  var html = invoice.render(order);
  assert.match(html, /Invoice Total<\/td><td class="r">₹311\.60/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice uses checkout discount and tax totals for discounted lines', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 200, qty: 1 },
    { id: 2, name: 'Tea', hsn: '0902', price: 100, qty: 1 }
  ];
  var order = { items: items, coupon: 'WELCOME' };
  var checkout = pricing.computeTotals(items, 'WELCOME');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(checkout.tax, 26.6);
  assert.equal(figures.tax, checkout.tax);
  assert.equal(checkout.discount, 15);
  assert.equal(figures.discount, checkout.discount);
  assert.equal(figures.rows.reduce(function (sum, row) { return sum + row.lineTax; }, 0), checkout.tax);
  assert.equal(figures.rows.reduce(function (sum, row) { return sum + row.line; }, 0), figures.subtotal);
  assert.equal(tax.getRateForItem(items[0]), 0.05);
});

test('invoice uses recorded billed totals when present', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    subtotal: 100,
    discount: 5,
    tax: 4.75,
    total: 99.75
  });

  assert.equal(figures.subtotal, 100);
  assert.equal(figures.discount, 5);
  assert.equal(figures.tax, 4.75);
  assert.equal(figures.cgst + figures.sgst, figures.tax);
  assert.equal(figures.total, 99.75);
});

test('invoice resolves decimal gstRate using the same rule as checkout', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Rice', price: 100, qty: 1, gstRate: 0.05 }]
  });

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.tax, 5);
});
