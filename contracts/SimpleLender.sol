//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;
import "./interfaces/IERC20.sol";
import "./interfaces/ISimpleAMM.sol";

contract SimpleLender {
    address public USDCAddress;
    address public ammAddress;
    uint16 public collateralizationRatio;
    mapping(address => uint256) public USDCdeposits;

    constructor(
        address usdc,
        address amm,
        uint16 collat
    ) {
        USDCAddress = usdc;
        ammAddress = amm;
        collateralizationRatio = collat; // in basis points
    }

    function depositUSDC(uint256 amount) external {
        IERC20(USDCAddress).transferFrom(msg.sender, address(this), amount);
        USDCdeposits[msg.sender] += amount;
    }

    function getPriceUSDCETH() public view returns (uint256) {
        // (Vulnerable) External call to AMM used as price oracle
        return ISimpleAMM(ammAddress).priceUSDCETH();
    }

    function maxBorrowAmount() public view returns (uint256) {
        // Does not take into consideration any exisitng borrows (collateral already used)
        uint256 depositedUSDC = USDCdeposits[msg.sender];
        uint256 equivalentEthValue = (depositedUSDC * getPriceUSDCETH()) / 1e18;
        // Max borrow amount = (collateralizationRatio/10000) * eth value of deposited USDC
        return (equivalentEthValue * collateralizationRatio) / 10000;
    }

    function borrowETH(uint256 amount) external {
        // Does not take into consideration any exisitng borrows
        require(
            amount <= maxBorrowAmount(),
            "amount exceeds max borrow amount"
        );
        (bool success, ) = msg.sender.call{value: amount}(new bytes(0));
        require(success, "Failed to transfer ETH");
    }

    receive() external payable {}
}
