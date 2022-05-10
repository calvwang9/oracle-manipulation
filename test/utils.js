function calculateSwapAmountTo(balanceFrom, balanceTo, amountFrom) {
  return balanceTo.mul(amountFrom).div(balanceFrom.add(amountFrom));
}

module.exports = { calculateSwapAmountTo };
