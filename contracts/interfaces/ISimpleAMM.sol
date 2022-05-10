//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface ISimpleAMM {
    function balanceETH() external view returns (uint256);

    function balanceUSDC() external view returns (uint256);

    function priceUSDCETH() external view returns (uint256);

    function priceETHUSDC() external view returns (uint256);

    function getEstimatedEthForUSDC(uint256 amountFrom)
        external
        view
        returns (uint256);

    function getEstimatedUSDCForEth(uint256 amountFrom)
        external
        view
        returns (uint256);

    function swap(address fromToken, uint256 amountFrom)
        external
        payable
        returns (uint256);
}
