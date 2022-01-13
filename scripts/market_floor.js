const hre = require("hardhat");
const { DetermineMaxSellableCheez } = require("./helpers/DetermineMaxSellableCheez");
const { InitialLogs } = require("./helpers/InitialLogs");
const { trim } = require("./helpers/trim");
const CONFIG = require("../config.js");
const fs = require('fs');

const MARKET_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "offerID",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "BuyOffer",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_tokenID",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_deadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_price",
        "type": "uint256"
      }
    ],
    "name": "MakeOffer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

const { FLOOR_PRICES, MAX_SESSION_CHEEZ } = CONFIG.scripts.market_floor;

let { LP_ADDRESS, ROUTER_ADDRESS, TOKEN_ADDRESS, DAI_ADDRESS, MARKET_ADDRESS } = {...CONFIG.addresses, ...(!!CONFIG.scripts.market_floor.addresses ? CONFIG.scripts.market_floor.addresses : {})};

let session_cheez = 0;

run("compile")
  .then(InitialLogs.bind(null, "Market Floor Script"))
  .then(() => {
      let index = 0;
      return loop();
      function loop() {
          index++; 
          return TryRaisingFloor(index)
          .then(async () => new Promise((res) => setTimeout(res, 1000*60)))
          .then(loop)
          .catch(async err => {
            console.error(err);
            // Wait 5 times longer before retrying
            await new Promise((res) => setTimeout(res, 1000*60*5));
            return loop();
          });
      }
  });


// END OF FILE

// BEGINNING OF FUNCTIONS

/**
 * @description Will attempt to buy up the floor on mice/cats
 * 
 * (Optionally) sell mice/cats and undercut market price
 * @returns {Promise<boolean>} true if the rebond was successful
 */
async function TryRaisingFloor(index) {

  // 1.) SETUP CONTRACTS
  const { MAIN_SIGNER, MAIN_ADDRESS } = await InitSigner();
  /* TODO add MarketContract once I get abi */
  const { MarketContract, Cheez, SushiRouter, DAI, LP } = await GetContracts();

  const reserves = await LP.getReserves();

  // 2.) GET TRUE MARKET PRICE OF CHEEZ
  const marketPrice = trim((Number(reserves[1].toString()) / Number(reserves[0].toString())) / Math.pow(10, 9),2)

  /* DEV NOTE: Example api response for a cat listing
  {
        "_id": "61c8d6f8fabddcf236084f9a",
        "offerId": "2135",
        "admin": "0x6aA115f03aF151f9dEe1608046a63a8e0483A697",
        "token": "0x4e9c30CbD786549878049f808fb359741BF721ea",
        "tokenId": 1,
        "amount": 46,
        "deadline": "1672088164",
        "price": 13980000000,
        "listingEnabled": true,
        "created": "2021-12-26T20:56:24.473Z",
        "__v": 0
    }
    */

  // 3.) GET LISTINGS
  const [mice, cats, traps] = await Promise.all([ GetMarketListings(0), GetMarketListings(1), GetMarketListings(2) ]);

  // log market price
  console.log(`🧀 Market Price: ${marketPrice}`);
  
  // Get prices of items in cheez
  const MICE_PRICE = mice[0].price / Math.pow(10, 9);
  const CAT_PRICE = cats[0].price / Math.pow(10, 9);
  const TRAP_PRICE = traps[0].price / Math.pow(10, 9);

  // Get CHEEZ balance
  const CHEEZ_BALANCE = await Cheez.balanceOf(MAIN_ADDRESS);

  // Log the price of the first mouse, cat and trap listings with usd price
  console.log(`First Mouse Price: ${MICE_PRICE} CHEEZ (${(MICE_PRICE * marketPrice).toFixed(2)} USD)`);
  console.log(`First Cat Price: ${CAT_PRICE} CHEEZ (${(CAT_PRICE * marketPrice).toFixed(2)} USD)`);
  console.log(`First Trap Price: ${TRAP_PRICE} CHEEZ (${(TRAP_PRICE * marketPrice).toFixed(2)} USD)`);

  const AMOUNT = 1;

  const miceID = mice[0].offerId;
  const catID = cats[0].offerId;
  const trapID = traps[0].offerId;

  // TODO Check if balance is below all prices
  if (CHEEZ_BALANCE / Math.pow(10, 9) < MICE_PRICE * AMOUNT && CHEEZ_BALANCE / Math.pow(10, 9) < CAT_PRICE * AMOUNT && CHEEZ_BALANCE / Math.pow(10, 9) < TRAP_PRICE * AMOUNT) {
    console.log(`🧀 Balance: ${CHEEZ_BALANCE / Math.pow(10, 9)} CHEEZ`);
    console.log("Not enough CHEEZ to buy anything");
    console.log("Shutting down...");
    process.exit(0);
  }
  // if (MICE_PRICE > CHEEZ_BALANCE / Math.pow(10, 9) && ) {
  //   console.log("Not enough CHEEZ to mice");
  //   return false;
  // }

  // Try to estimate gas for buying floor listing, using (listing_id, amount)
  const [estimatedGasMice, estimatedGasCats, estimatedGasTraps] = await Promise.all([
    MarketContract.estimateGas.BuyOffer(Number(miceID), AMOUNT ).catch(err => null),
    MarketContract.estimateGas.BuyOffer(Number(catID), AMOUNT ).catch(err => null),
    MarketContract.estimateGas.BuyOffer(Number(trapID), AMOUNT ).catch(err => null)
  ])
  if (!estimatedGasMice) AddOfferIDToBlacklist(miceID);
  if (!estimatedGasCats) AddOfferIDToBlacklist(catID);
  if (!estimatedGasTraps) AddOfferIDToBlacklist(trapID);

  // Check to make sure at least one of config FLOOR_PRICES are above -1
  if (FLOOR_PRICES["mice"] == -1 && FLOOR_PRICES["cats"] == -1 && FLOOR_PRICES["traps"] == -1) {
    console.log("No floor prices set in config.json");
    console.log("Shutting down...")
    process.exit(0);
  }

  await CheckIfAtMaxCheez()
  await BuyOfferTypeIfValid("mice", mice[0]);

  await CheckIfAtMaxCheez()
  await BuyOfferTypeIfValid("cats", cats[0]);

  await CheckIfAtMaxCheez()
  await BuyOfferTypeIfValid("traps", traps[0]);

    
  // END OF FUNCTION

  async function CheckIfAtMaxCheez() {
    if(session_cheez > MAX_SESSION_CHEEZ * Math.pow(10, 9) && MAX_SESSION_CHEEZ > 0) {
      console.log("🧀 Reached max session CHEEZ");
      console.log(new Date().toLocaleString());
      process.exit(0);
    }
    console.log(`🧀 Session CHEEZ: ${session_cheez / Math.pow(10, 9)} / ${MAX_SESSION_CHEEZ}`);
    return false
  }

  async function BuyOfferTypeIfValid(type, listing) {
    if(FLOOR_PRICES[type] !== -1) {
      if(!estimatedGasCats) {
        console.log(`Waiting for valid ${type} listing`);return false;
      }

    const CHEEZ_BALANCE = await GetBalance(Cheez, MAIN_ADDRESS);

      if(CHEEZ_BALANCE < listing.price) { console.warn(`Balance low...`); console.log(`waiting for cheaper ${type} listing`); return false; }

      // Determine max buyable nfts
      const maxBuyableNFTs = Math.floor(CHEEZ_BALANCE / listing.price);

      // if maxBuyableNFTs is greater than the listing amount, buy the listing amount, else, buy maxBuyableNFTs
      const amountToBuy = maxBuyableNFTs > listing.amount ? listing.amount : maxBuyableNFTs;

      if(FLOOR_PRICES[type] > 0 && (listing.price / Math.pow(10, 9)) > FLOOR_PRICES[type]) return console.log(`Waiting for cheaper ${type} listing...`);
      console.log(`Buying ${amountToBuy} ${amountToBuy == 1 ? type.split("s")[0] : type} for ${amountToBuy * listing.price / Math.pow(10, 9)} CHEEZ`);

      if ((amountToBuy * listing.price * Math.pow(10, 9)) + session_cheez > MAX_SESSION_CHEEZ * Math.pow(10, 9))
        {
          console.log(`🧀 Reached max session CHEEZ`);
          console.log(new Date().toLocaleString());
          process.exit(0);
        }

      
      // Buy listing
      await MarketContract.BuyOffer(Number(listing.offerId), amountToBuy);
      const balance_after = await GetBalance(Cheez, MAIN_ADDRESS);
      // difference in balances 
      const difference = CHEEZ_BALANCE - balance_after;
      // add difference to session_cheez
      session_cheez += Math.abs(difference);

      return true;
    }
    console.log(`Not buying floor listings for ${type}...`); 
  }

  function AddOfferIDToBlacklist() {
    // If InvalidOffers.txt doesn't exist, create it
    if (!fs.existsSync("../InvalidOffers.txt")) fs.writeFileSync("../InvalidOffers.txt", "");
    // Add offer id to InvalidOffers.txt
    fs.appendFileSync(`${__dirname}/InvalidOffers.txt`, `${mice[0].offerId}\n`);
    console.error("Could not estimate gas, listing invalid or not enough CHEEZ in balance");
  }

  async function GetContracts() {
    
    const LP = await ethers.getContractAt([
      "function getReserves() public view returns (uint256, uint256)",
      "function token0() public view returns (address)",
      "function token1() public view returns (address)",
      "function totalSupply() public view returns (uint256)",
      "function balanceOf(address) public view returns (uint256)",
    ], LP_ADDRESS, MAIN_SIGNER);
    const SushiRouter = await ethers.getContractAt("IUniswapRouter02", ROUTER_ADDRESS, MAIN_SIGNER);
    const Cheez = await ethers.getContractAt("contracts/TimeStaking.sol:IERC20", TOKEN_ADDRESS, MAIN_SIGNER);
    const DAI = await ethers.getContractAt("contracts/TimeStaking.sol:IERC20", DAI_ADDRESS, MAIN_SIGNER);
    
    const MarketContract = await hre.ethers.getContractAt(MARKET_ABI, MARKET_ADDRESS, MAIN_SIGNER);

    
    return { MarketContract, LP, Cheez, SushiRouter, DAI };
  }

  async function InitSigner() {
    console.log(`\n\n  --- Round #${index} ${new Date().toLocaleTimeString()} ---\n`);
    // Wrap hardhat ethers provider with a provider that can call multiple contracts
    const MAIN_SIGNER = (await ethers.getSigners())[0];
    const MAIN_ADDRESS = MAIN_SIGNER.address;

    return { MAIN_SIGNER, MAIN_ADDRESS };
  }
}

async function GetBalance(Cheez, MAIN_ADDRESS) {
  return Number((await Cheez.balanceOf(MAIN_ADDRESS)).toString());
}

async function GetMarketListings(id, owner = null) {
   const fetch = (await import('node-fetch')).default;
  //  check that id exists in ITEM_TYPES keys in config.js
  if (!Object.keys(CONFIG.ITEM_TYPES).includes(id.toString())) throw new Error(`Invalid item type: ${id} valid keys are...\n${Object.keys(CONFIG.ITEM_TYPES).join(', ')}`);

  return fetch(`https://api.cheesedao.xyz/apiv1/marketplace/listings/?${owner ? `admin=${owner}` : ""}tokenId=${id}&sortBy=price&sort=ASC&page=0&pageSize=100`, {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "sec-gpc": "1",
      "Referer": "https://www.cheesedao.xyz/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": null,
    "method": "GET"
  }).then(res => res.json()).then(async listings => {
    // if no InvalidOffers.txt exists, ignore blacklist
    if (!fs.existsSync("../InvalidOffers.txt")) return listings;
    // load InvalidOffers.txt and see if listing is in it
    const invalidOffers = fs.readFileSync(`${__dirname}/InvalidOffers.txt`, 'utf8').split('\n');
    // filter out invalid listings
    const validListings = listings.filter(listing => !invalidOffers.includes(listing.offerId.toString()));
    return validListings;
  });
}

