const hre = require("hardhat");
const { DetermineMaxSellableCheez } = require("./helpers/DetermineMaxSellableCheez");
const { GetContractAddresses } = require("./helpers/GetContractAddresses");
require('dotenv').config();
const { InitialLogs } = require("./helpers/InitialLogs");
const { trim } = require("./helpers/trim");
const { MIN_USD_PRICE_TO_SELL, MINIMUM_BONDS_PROFITABILITY } = require("./helpers/user_inputs");


let { BOND_CONTRACT_ADDRESS, BOND_CALCULATOR_ADDRESS, STAKING_CONTRACT_ADDRESS, LP_ADDRESS, ROUTER_ADDRESS, TOKEN_ADDRESS, DAI_ADDRESS } = GetContractAddresses();
const SELL_CLAIM = process.env.SELL == "true";
const IGNORE_BOND_PROFITABILITY = !!process.env.IGNORE_BOND_PROFITABILITY;
const SHOULD_STAKE = process.env.STAKE == "true";

hre.run("compile")
  .then(InitialLogs.bind(null, "Bond Claim Script"))
  .then(() => {
      let index = 0;
      return loop();
      function loop() {
          index++; 
          return TryClaiming(index)
          .then(async () => new Promise((res) => setTimeout(res, 1000*60)))
          .then(loop)
          .catch(err => {
              console.error(err);
              process.exit(1);
          });
      }
  });

// END OF FILE

// BEGINNING OF FUNCTIONS

/**
 * @description Will attempt to rebond existing LP along with any cheez that is available in the user's wallet
 * @returns {Promise<boolean>} true if the rebond was successful
 */
async function TryClaiming(index) {

  // 1.) SETUP CONTRACTS
  const { MAIN_SIGNER, MAIN_ADDRESS } = await InitSigner();
  const { BondContract, StakingContract, Cheez, SushiRouter, DAI, LP } = await GetContracts();

  // 2.) GET BOND INFO
  const { price: bondPrice, nativePrice } = await GetPrice();
  const pendingPayout = await BondContract.pendingPayoutFor(MAIN_ADDRESS)
  const reserves = await LP.getReserves();

  // 3.) DETERMINE AMOUNT TO SELL
  const balance = await Cheez.balanceOf(MAIN_ADDRESS);
  const SELL_PERCENT = Math.floor(Number(process.env.SELL_PERCENT) * 100);
  const potentialCheezToSell = SELL_CLAIM ? pendingPayout.mul(SELL_PERCENT).div(10000) : hre.ethers.BigNumber.from(0);

  if(Number(pendingPayout.toString()) / Math.pow(10, 9) < 0.01) return console.log("Not enough CHEEZ to claim");

  // 4.) GET TRUE MARKET PRICE
  const marketPrice = trim((Number(reserves[1].toString()) / Number(reserves[0].toString())) / Math.pow(10, 9),2)

  // 5.) GET BOND DISCOUNT USING CURRENT MARKET PRICE
  const bondDiscount = (1 - (Number(bondPrice) / Number(marketPrice))) * 100;

  // LOGS
  console.log(`Balance: ${trim(Number(balance.toString()) / Math.pow(10, 9), 2)} CHEEZ`);
  console.log(`Pending Payout: ${trim(Number(pendingPayout.toString()) / Math.pow(10, 9), 2)} CHEEZ (${trim((Number(pendingPayout.toString()) / Math.pow(10, 9)) * marketPrice, 2)} USD)`);
  console.log(`Cheez to Sell: ${trim(Number(potentialCheezToSell.toString()) / Math.pow(10, 9), 2)} CHEEZ (${trim((Number(potentialCheezToSell.toString()) / Math.pow(10, 9)) * marketPrice, 2)} USD)`);
  console.log(`Market Price: ${trim(marketPrice, 2)} USD (MIN ${trim(MIN_USD_PRICE_TO_SELL, 2)} USD)`);
  console.log(`Bond Discount: ${trim(bondDiscount, 2)}% (MIN ${trim(MINIMUM_BONDS_PROFITABILITY, 2)}%)`);
  console.log(`Bond Price: ${trim(bondPrice, 2)} USD`);

  if(bondDiscount > MINIMUM_BONDS_PROFITABILITY || IGNORE_BOND_PROFITABILITY) {
    await RedeemAndSell();
    return true
  } else {
    console.log("Bonds not profitable to sell into")
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
    const BondCalculator = await hre.ethers.getContractAt("TimeBondingCalculator", BOND_CALCULATOR_ADDRESS, MAIN_SIGNER);
    const StakingContract = await hre.ethers.getContractAt("TimeStaking", STAKING_CONTRACT_ADDRESS, MAIN_SIGNER);
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
    return { BondContract, BondCalculator, StakingContract, LP, Cheez, SushiRouter, DAI };
  }

  async function InitSigner() {
    console.log(`\n\n  --- Round #${index} ${new Date().toLocaleTimeString()} ---\n`);
    // Wrap hardhat ethers provider with a provider that can call multiple contracts
    const MAIN_SIGNER = (await hre.ethers.getSigners())[0];
    const MAIN_ADDRESS = MAIN_SIGNER.address;

    return { MAIN_SIGNER, MAIN_ADDRESS };
  }

  async function RedeemAndSell() {
    const token0 = "0xBbD83eF0c9D347C85e60F1b5D2c58796dBE1bA0d"; // Cheez
    const token1 = "0xef977d2f931c1978db5f6747666fa1eacb0d0339"; // DAI
    
    // get the  from the bondcontract
    
    const amountRedeemed = await BondContract.pendingPayoutFor(MAIN_ADDRESS);
    const MIN_AMOUNT_CLAIMED = Number(process.env.MIN_AMOUNT_CLAIMED);
    // if amountRedeemed is little, then we don't need to redeem
    if(Number(amountRedeemed.toString()) / Math.pow(10, 9) < (isNaN(MIN_AMOUNT_CLAIMED) ? 0.01 : MIN_AMOUNT_CLAIMED)) 
        return console.log("Not enough CHEEZ to claim");


    console.log(`Ready to claim! `);
    
    // Redeem Cheez
    await BondContract.redeem(MAIN_ADDRESS, false);
    console.log(`Redeemed ${trim(Number(amountRedeemed.toString()) / Math.pow(10, 9), 2)} CHEEZ`);

    let amountToStake = hre.ethers.BigNumber.from(0), 
        cheezToSell = hre.ethers.BigNumber.from(0);

    // Stake Cheez
    if(SHOULD_STAKE) {
        amountToStake = amountRedeemed.mul(Math.floor(Number(process.env.STAKE_PERCENT)*100)).div(10000);
        await StakingContract.stake(amountToStake, MAIN_ADDRESS);
        console.log(`Staked ${trim(Number(amountToStake.toString()) / Math.pow(10, 9), 2)} CHEEZ`);
    }
    
    const bondDiscount = (1 - (Number(bondPrice) / Number(marketPrice))) * 100;

    // percent difference between MIN_USD_PRICE_TO_SELL and current price
    const { maxSellableCheez, percentDifference } = await DetermineMaxSellableCheez(marketPrice, bondDiscount, LP);
    console.log("MAX CHEEZ TO SELL: " + maxSellableCheez + "CHEEZ");
    if(percentDifference < 0) return console.log(`Market price is too low to sell into (MIN ${trim(MIN_USD_PRICE_TO_SELL, 2)} USD)`);

    if(process.env.SELL == "true") {
        console.log(`Bond Price: ${trim(bondPrice, 2)} USD`);

        cheezToSell = amountRedeemed.sub(amountToStake).mul(Math.floor(Number(process.env.SELL_PERCENT)*100)).div(10000);

        const _selling = Number(cheezToSell.toString()) / Math.pow(10, 9);
        if(!Math.floor(maxSellableCheez)) return console.log("Bonds aren't high enough to sell into");

        // if cheezToSell is greater than maxCheezSellable, set to maxCheezSellable
        cheezToSell = _selling > maxSellableCheez && !IGNORE_BOND_PROFITABILITY 
            ? hre.ethers.BigNumber.from(Math.floor(maxSellableCheez * Math.pow(10,9))) 
            : cheezToSell;

        // if cheez is 0, then we don't need to sell
        if(cheezToSell.toString() === "0") return console.log("Not enough CHEEZ to sell");
        // log cheez to sell
        console.log(`Selling ${trim(Number(cheezToSell.toString()) / Math.pow(10, 9), 2)} CHEEZ`);
        await SushiRouter.swapExactTokensForTokens(cheezToSell, 0, [token0, token1], MAIN_ADDRESS, Math.floor(Date.now() / 1000) + 600);

    } else console.log("NOT SELLING")

    return Number(amountRedeemed.toString()) / Math.pow(10, 9) > 0;
  }
}

