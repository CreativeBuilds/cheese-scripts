const hre = require("hardhat");

function GetContractAddresses() {
    let BOND_CONTRACT_ADDRESS, BOND_CALCULATOR_ADDRESS, STAKING_CONTRACT_ADDRESS, LP_ADDRESS, ROUTER_ADDRESS, TOKEN_ADDRESS, DAI_ADDRESS;
    try {
        BOND_CONTRACT_ADDRESS = hre.ethers.utils.getAddress(process.env.BOND_CONTRACT_ADDRESS);
    } catch (err) {
        console.error(err);
        throw new Error("BOND_CONTRACT_ADDRESS not set in .env file");
    }
    try {
        BOND_CALCULATOR_ADDRESS = hre.ethers.utils.getAddress(process.env.BOND_CALCULATOR_ADDRESS);
    } catch (err) {
        throw new Error("BOND_CALCULATOR_ADDRESS not set in .env file");
    }
    try {
        STAKING_CONTRACT_ADDRESS = hre.ethers.utils.getAddress(process.env.STAKING_CONTRACT_ADDRESS);
    } catch (err) {
        throw new Error("STAKING_CONTRACT_ADDRESS not set in .env file");
    }
    try {
        LP_ADDRESS = hre.ethers.utils.getAddress(process.env.LP_ADDRESS);
    } catch (err) {
        throw new Error("LP_ADDRESS not set in .env file");
    }
    try {
        ROUTER_ADDRESS = hre.ethers.utils.getAddress(process.env.ROUTER_ADDRESS);
    } catch (err) {
        throw new Error("ROUTER_ADDRESS not set in .env file");
    }
    try {
        TOKEN_ADDRESS = hre.ethers.utils.getAddress(process.env.TOKEN_ADDRESS);
    } catch (err) {
        throw new Error("TOKEN_ADDRESS not set in .env file");
    }
    try {
        DAI_ADDRESS = hre.ethers.utils.getAddress(process.env.DAI_ADDRESS);
    } catch (err) {
        throw new Error("DAI_ADDRESS not set in .env file");
    }
    return { BOND_CONTRACT_ADDRESS, BOND_CALCULATOR_ADDRESS, STAKING_CONTRACT_ADDRESS, LP_ADDRESS, ROUTER_ADDRESS, TOKEN_ADDRESS, DAI_ADDRESS };
}
exports.GetContractAddresses = GetContractAddresses;
