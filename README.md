# Oracle manipulation

This repo explores price oracle manipulation, a common attack vector in DeFi protocols. This is for educational purposes only and comes with no warranties or guarantees, and should not be used in production, maliciously or otherwise.

## Context

Oracle manipulation is a fairly common attack vector in DeFi that has resulted in a few high profile exploits. The issue stems from using an AMM liquidity pool as a price oracle by dividing the number of tokens on each side of the pool to determine the spot exchange rate. For example: an AMM liquidity pool with 1 ETH and 3000 USDC results in a spot price of $3000 USDC per 1 ETH.

This kind of naive price oracle is vulnerable to manipulation (especially if used with a shallow liquidity pool) and can be exploited by bad actors changing the oracle's spot price in their favor by making large trades, leading to a variety of creative exploits smart contracts that rely on the oracle for important operations. Flash loans facilitate these these kinds of attacks as they make it accessible to entities without a large pool of capital.

These articles go through some examples of real DeFi attacks related to price oracle manipulation:

- https://hackernoon.com/how-dollar100m-got-stolen-from-defi-in-2021-price-oracle-manipulation-and-flash-loan-attacks-explained-3n6q33r1
- https://medium.com/meter-io/the-bzx-attacks-what-went-wrong-and-the-role-oracles-played-in-the-exploits-264619b9597d

## Details

These contracts aim to illustrate a theoretical example of how such a price oracle can be manipulated to drain a lending protocol. A simple implementation of an AMM and a lending protocol is used in the demonstration, and the use of a flash loan is simulated. The input and initialization values are arbitrary and serve only as a proof of concept, and in practice there are a lot more limitations such as borrowing limits, fees, etc.

Setup:

- Simple ETH/USDC AMM liquidity pool
  - Initialized with 1 ETH and 3000 USDC, implying a price of $3000/ETH
- Basic lending protocol
  - Accepts USDC deposits and lends ETH based on a collateralization ratio of 0.8
  - Uses a (vulnerable) price oracle that retrieves the USDC/ETH price based on the above AMM pool
  - Initialized with 5 ETH as reserves

Execution:

1. Flash loan 2 ETH
2. Swap 2 ETH for USDC in AMM (receive 2000 USDC)
3. Deposit 2000 USDC into lending protocol
4. Borrow max amount of ETH against deposited USDC (4.8 ETH)
5. Repay flash loan of 2 ETH and keep profits (2.8 ETH)

Why it works:

The naive use of an AMM pool as a price oracle is essentially a centralized oracle that is vulnerable to manipulation, even if the AMM itself is decentralized.

The swap in step 2 significantly impacts the ratio between the tokens in the pool as it is a relatively large trade on a pool with very shallow liquidity, and consequently affects the relativel price of the token returned by the oracle. After the swap, the pool contains 3 ETH and 1000 USDC, resulting in a spot price of 1 ETH = 1000/3 USDC = $333 per ETH.

When borrowing ETH against USDC as collateral, at $3000 per ETH you should only be able to borrow 0.8 _ $2000 worth of ETH = 0.8 _ ($2000 / $3000) = 0.528 ETH. However, since the lending protocol's price oracle returns ~$333 per ETH as per the manipulated AMM pool reserves, it lets you borrow up to 0.8 \* ($2000 / $333) = 4.8 ETH.

The attack pattern is illustrated in `test/OracleAttack.test.js`, which runs through the steps to execute the attack in mulitple separate transactions for step-by-step explanations, as well as all in one transaction through `Attacker.sol`. 

## Mitigation

A common approach to avoid these kinds of centralized points of vulnerability is to use a decentralized price oracle that employs some kind of averaging across several (deep liquidity) pools to determine the true price. This is much harder to manipulate as it is financially practically impossible to source enough funds to be able to significantly change the price of multiple pools, especially those which have deeper liquidity.

Another approach is to use time-weighted average price (TWAP) oracles which take the average price of the asset over a specified period of time, reducing the risk of single-transaction flash loan attacks but sacrifices some degree of accuracy during periods of high volatility. It is harder, though still possible, to manipulate these mechanisms across multiple blocks.
