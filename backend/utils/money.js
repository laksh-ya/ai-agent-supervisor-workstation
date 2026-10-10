// utils/money.js
// Amounts are stored in INR (the design's base currency). The workstation can display USD;
// conversion uses a fixed demo rate so numbers stay stable between refreshes.
const INR_PER_USD = 83;

function formatMoney(amountInr, currency = 'INR') {
  const value = Number(amountInr) || 0;
  if (currency === 'USD') {
    return `$${(value / INR_PER_USD).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

module.exports = { INR_PER_USD, formatMoney };
