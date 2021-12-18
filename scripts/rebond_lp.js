const hre = require("hardhat");
require('dotenv').config();
const { InitialLogs } = require("./helpers/InitialLogs");
const { trim } = require("./helpers/trim");

let { 
  MIN_CHEEZ_TO_BOND, 
  MIN_BOND_PROFIT_PERCENT,
  BOND_CONTRACT_ADDRESS,
  BOND_CALCULATOR_ADDRESS,
  LP_ADDRESS,
  ROUTER_ADDRESS,
  TOKEN_ADDRESS,
  DAI_ADDRESS
 } = DetermineUserInput();

hre.run("compile")
  .then(StartRebondLoop);

// END OF FILE

// BEGINNING OF FUNCTIONS

async function StartRebondLoop(index = 0) { 
  index++;
  if(index == 1) InitialLogs()
  
  return TryRebonding(index)
  .then((rebonded) => WaitBeforeRetry(rebonded))
  .then(() => StartRebondLoop(index))

  // If successful rebonded, wait longer before retrying
  function WaitBeforeRetry(rebonded) {
    return new Promise(resolve => setTimeout(resolve, 1000 * 60 * (rebonded ? 5 : 1)));
  }
}

/**
 * @description Will attempt to rebond existing LP along with any cheez that is available in the user's wallet
 * @returns {Promise<boolean>} true if the rebond was successful
 */
async function TryRebonding(index) {

  // 1.) SETUP CONTRACTS
  const { MAIN_SIGNER, MAIN_ADDRESS } = await InitSigner();
  const { BondContract, BondCalculator, LP, Cheez, SushiRouter, DAI } = await GetContracts();

  // 2.) GET BOND INFO
  const { price, nativePrice } = await GetPrice();
  const pendingPayout = await BondContract.pendingPayoutFor(MAIN_ADDRESS)
  const reserves = await LP.getReserves();

  // 3.) DETERMINE AMOUNT TO SELL FOR LP
  const balance = await Cheez.balanceOf(MAIN_ADDRESS);
  const cheezToSell = pendingPayout.add(balance).div(2);

  if(Number(cheezToSell.toString()) / Math.pow(10, 9) < MIN_CHEEZ_TO_BOND) return console.log("Not enough CHEEZ to rebond");

  // 4.) GET TRUE MARKET PRICE
  const marketPrice = trim((Number(reserves[1].toString()) / Number(reserves[0].toString())) / Math.pow(10, 9),2)

  // 5.) GET BOND DISCOUNT USING CURRENT MARKET PRICE
  const bondDiscount = (1 - (Number(price) / Number(marketPrice))) * 100;

  // LOGS
  console.log(`Balance: ${trim(Number(balance.toString()) / Math.pow(10, 9), 2)} CHEEZ`);
  console.log(`Pending Payout: ${trim(Number(pendingPayout.toString()) / Math.pow(10, 9), 2)} CHEEZ (${trim((Number(pendingPayout.toString()) / Math.pow(10, 9)) * marketPrice, 2)} USD)`);
  console.log(`Cheez to Sell: ${trim(Number(cheezToSell.toString()) / Math.pow(10, 9), 2)} CHEEZ (${trim((Number(cheezToSell.toString()) / Math.pow(10, 9)) * marketPrice, 2)} USD)`);
  console.log(`Market Price: ${trim(marketPrice, 2)} USD`);
  console.log(`Bond Discount: ${trim(bondDiscount, 2)}% (MIN ${trim(MIN_BOND_PROFIT_PERCENT, 2)}%)`);
  console.log(`Bond Price: ${trim(price, 2)} USD`);

  if(bondDiscount > MIN_BOND_PROFIT_PERCENT) {
    await RedeemAndBond();
    return true
  } else {
    console.log("Bonds not profitable")
    return false
  }

  // END OF FUNCTION

  async function GetPrice() {
    const nativePrice = await BondContract.bondPrice();
    const price = trim(Number((await BondContract.bondPriceInUSD()).toString()) / Math.pow(10, 18), 2);
    return { price, nativePrice };
  }

  async function GetContracts() {
    
    const BondContract = await hre.ethers.getContractAt("BondDepository", BOND_CONTRACT_ADDRESS, MAIN_SIGNER);
    const BondCalculator = await hre.ethers.getContractAt("TimeBondingCalculator", BOND_CALCULATOR_ADDRESS);
    const LP = await hre.ethers.getContractAt([
      "function getReserves() public view returns (uint256, uint256)",
      "function token0() public view returns (address)",
      "function token1() public view returns (address)",
      "function totalSupply() public view returns (uint256)",
      "function balanceOf(address) public view returns (uint256)",
    ], LP_ADDRESS, MAIN_SIGNER);
    const SushiRouter = await hre.ethers.getContractAt("IUniswapRouter02", ROUTER_ADDRESS, MAIN_SIGNER);
    const Cheez = await hre.ethers.getContractAt("contracts/TimeStaking.sol:IERC20", TOKEN_ADDRESS, MAIN_SIGNER);
    const DAI = await hre.ethers.getContractAt("contracts/TimeStaking.sol:IERC20", DAI_ADDRESS, MAIN_SIGNER);
    return { BondContract, BondCalculator, LP, Cheez, SushiRouter, DAI };
  }

  async function InitSigner() {
    console.log(`\n\n  --- Round #${index} ${new Date().toLocaleTimeString()} ---\n`);
    // Wrap hardhat ethers provider with a provider that can call multiple contracts
    const MAIN_SIGNER = (await hre.ethers.getSigners())[0];
    const MAIN_ADDRESS = MAIN_SIGNER.address;

    return { MAIN_SIGNER, MAIN_ADDRESS };
  }

  async function RedeemAndBond(amount = cheezToSell) {
    console.log(`Ready to bond!`);
    console.time(`Step 4.) Succesfully rebonded! 🧀🧀🧀 `);

    const token0 = "0xBbD83eF0c9D347C85e60F1b5D2c58796dBE1bA0d"; // Cheez
    const token1 = "0xef977d2f931c1978db5f6747666fa1eacb0d0339"; // DAI

    // Using ethers-multicall do the following
    // 1.) Claim existing bonds
    // 2.) Sell half of claimed bonds
    // 3.) Form LP w/ half of sold bonds
    // 4.) Bond new LP tokens

    console.time("Step 1.) Redeemed");
    await BondContract.redeem(MAIN_ADDRESS, false);
    console.timeEnd("Step 1.) Redeemed");
    console.time("Step 2.) Swapped for DAI");
    await SushiRouter.swapExactTokensForTokens(amount, 0, [token0, token1], MAIN_ADDRESS, Math.floor(Date.now() / 1000) + 600);
    console.timeEnd("Step 2.) Swapped for DAI");
    console.time("Step 3.) add Liquidity");
    const DAIBalance = await DAI.balanceOf(MAIN_ADDRESS);
    console.log(`DAI Balance: ${trim(DAIBalance.toString() / Math.pow(10, 18), 2)}`);
    await SushiRouter.addLiquidity(token0, token1, amount, DAIBalance, 0, 0, MAIN_ADDRESS, Math.floor(Date.now() / 1000) + 600, { gasLimit: 1000000 });
    console.timeEnd("Step 3.) add Liquidity");
    console.time(`Step 4.) Succesfully rebonded! `);
    await BondContract.deposit(await LP.balanceOf(MAIN_ADDRESS), nativePrice.mul(102).div(100), MAIN_ADDRESS);
    console.timeEnd(`Step 4.) Succesfully rebonded! 🧀🧀🧀 `);
  }
}

function DetermineUserInput() {
  let MIN_CHEEZ_TO_BOND = Number(process.env.MIN_CHEEZ_TO_BOND);
  if (!MIN_CHEEZ_TO_BOND) {
    MIN_CHEEZ_TO_BOND = 1;
    console.log("MIN_CHEEZ_TO_BOND not set, defaulting to " + MIN_CHEEZ_TO_BOND);
  }
  let MIN_BOND_PROFIT_PERCENT = Number(process.env.MIN_BOND_PROFIT_PERCENT);
  if (!MIN_BOND_PROFIT_PERCENT) {
    MIN_BOND_PROFIT_PERCENT = 9.5;
    console.log("MIN_BOND_PROFIT_PERCENT not set, defaulting to 9.5%");
  }
  let BOND_CONTRACT_ADDRESS,
      BOND_CALCULATOR_ADDRESS,
      LP_ADDRESS,
      ROUTER_ADDRESS,
      TOKEN_ADDRESS,
      DAI_ADDRESS;
  try {
    BOND_CONTRACT_ADDRESS = hre.ethers.utils.getAddress(process.env.BOND_CONTRACT_ADDRESS);
  } catch(err) {
    console.error(err)
    throw new Error("BOND_CONTRACT_ADDRESS not set in .env file");
  }
  try {
    BOND_CALCULATOR_ADDRESS = hre.ethers.utils.getAddress(process.env.BOND_CALCULATOR_ADDRESS);
  } catch(err) {
    throw new Error("BOND_CALCULATOR_ADDRESS not set in .env file");
  }
  try {
    LP_ADDRESS = hre.ethers.utils.getAddress(process.env.LP_ADDRESS);
  } catch(err) {
    throw new Error("LP_ADDRESS not set in .env file");
  }
  try {
    ROUTER_ADDRESS = hre.ethers.utils.getAddress(process.env.ROUTER_ADDRESS);
  } catch(err) {
    throw new Error("ROUTER_ADDRESS not set in .env file");
  }
  try {
    TOKEN_ADDRESS = hre.ethers.utils.getAddress(process.env.TOKEN_ADDRESS);
  } catch(err) {
    throw new Error("TOKEN_ADDRESS not set in .env file");
  }
  try {
    DAI_ADDRESS = hre.ethers.utils.getAddress(process.env.DAI_ADDRESS);
  } catch(err) {
    throw new Error("DAI_ADDRESS not set in .env file");
  }
  
  return { 
    MIN_CHEEZ_TO_BOND, 
    MIN_BOND_PROFIT_PERCENT,
    BOND_CONTRACT_ADDRESS,
    BOND_CALCULATOR_ADDRESS,
    LP_ADDRESS,
    ROUTER_ADDRESS,
    TOKEN_ADDRESS,
    DAI_ADDRESS
   };
}
