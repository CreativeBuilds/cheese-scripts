const { MIN_USD_PRICE_TO_SELL, MINIMUM_BONDS_PROFITABILITY } = require("./user_inputs");

async function DetermineMaxSellableCheez(marketPrice, bondDiscount, LP) {
    const percentDifference = (1 - (MIN_USD_PRICE_TO_SELL / Number(marketPrice))) * 100;


    // difference between discount and minimum
    const difference_between_minimum = bondDiscount - (MINIMUM_BONDS_PROFITABILITY);

    // get cheez and dai reserves
    const reserves = await LP.getReserves();
    const cheezReserve = Number(reserves[0].toString()) / Math.pow(10, 9);
    const daiReserve = Number(reserves[1].toString()) / Math.pow(10, 9);

    const shouldUseDiff = (difference_between_minimum < percentDifference) && process.env.IGNORE_BOND_PROFITABILITY !== "true";
    // determine max sellable cheez
    const maxSellableCheez = cheezReserve * ((shouldUseDiff ? difference_between_minimum : percentDifference) / 100);
    return { maxSellableCheez, percentDifference };
}
exports.DetermineMaxSellableCheez = DetermineMaxSellableCheez;
