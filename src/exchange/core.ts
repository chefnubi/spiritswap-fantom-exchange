/* eslint-disable prefer-const */
import { BigInt, BigDecimal, store } from "@graphprotocol/graph-ts";
import {
  Pair,
  Token,
  SpiritswapFactory,
  Bundle,
} from "../types/schema";
import { Mint, Burn, Swap, Transfer, Sync } from "../types/templates/Pair/Pair";
import { updatePairDayData, updateTokenDayData, updateSpiritswapDayData } from "./dayUpdates";
import { getFtmPriceInUSD, findFtmPerToken, getTrackedVolumeUSD, getTrackedLiquidityUSD } from "./pricing";
import { convertTokenToDecimal, ADDRESS_ZERO, FACTORY_ADDRESS, ONE_BI, ZERO_BD, BI_18 } from "./utils";

export function handleTransfer(event: Transfer): void {
  // ignore initial transfers for first adds
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.value.equals(BigInt.fromI32(1000))) {
    return;
  }

  let from = event.params.from;
  let to = event.params.to;

  // get pair and load contract
  let pair = Pair.load(event.address.toHexString());

  // liquidity token amount being transferred
  let value = convertTokenToDecimal(event.params.value, BI_18);

  if (from.toHexString() == ADDRESS_ZERO) {
    // update total supply
    pair.totalSupply = pair.totalSupply.plus(value)
    pair.save()    
  } 

  // burn
  if (to.toHexString() == ADDRESS_ZERO && from.toHexString() == pair.id) {
    pair.totalSupply = pair.totalSupply.minus(value)
    pair.save()
  }
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHex());
  let token0 = Token.load(pair.token0);
  let token1 = Token.load(pair.token1);
  let pancake = SpiritswapFactory.load(FACTORY_ADDRESS);

  // reset factory liquidity by subtracting onluy tarcked liquidity
  pancake.totalLiquidityFTM = pancake.totalLiquidityFTM.minus(pair.trackedReserveFTM as BigDecimal);

  // reset token total liquidity amounts
  token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0);
  token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1);

  pair.reserve0 = convertTokenToDecimal(event.params.reserve0, token0.decimals);
  pair.reserve1 = convertTokenToDecimal(event.params.reserve1, token1.decimals);

  if (pair.reserve1.notEqual(ZERO_BD)) pair.token0Price = pair.reserve0.div(pair.reserve1);
  else pair.token0Price = ZERO_BD;
  if (pair.reserve0.notEqual(ZERO_BD)) pair.token1Price = pair.reserve1.div(pair.reserve0);
  else pair.token1Price = ZERO_BD;

  //pair.save();

  // update FTM price now that reserves could have changed
  let bundle = Bundle.load("1");
  bundle.ftmPrice = getFtmPriceInUSD();
  bundle.save();

  token0.derivedFTM = findFtmPerToken(token0 as Token);
  token1.derivedFTM = findFtmPerToken(token1 as Token);
  token0.save();
  token1.save();

  // get tracked liquidity - will be 0 if neither is in whitelist
  let trackedLiquidityFTM: BigDecimal;
  if (bundle.ftmPrice.notEqual(ZERO_BD)) {
    trackedLiquidityFTM = getTrackedLiquidityUSD(pair.reserve0, token0 as Token, pair.reserve1, token1 as Token, bundle as Bundle).div(
      bundle.ftmPrice
    )
  } else {
    trackedLiquidityFTM = ZERO_BD;
  }

  // use derived amounts within pair
  pair.trackedReserveFTM = trackedLiquidityFTM;
  pair.reserveFTM = pair.reserve0
    .times(token0.derivedFTM as BigDecimal)
    .plus(pair.reserve1.times(token1.derivedFTM as BigDecimal));
  pair.reserveUSD = pair.reserveFTM.times(bundle.ftmPrice);

  // use tracked amounts globally
  pancake.totalLiquidityFTM = pancake.totalLiquidityFTM.plus(trackedLiquidityFTM);
  pancake.totalLiquidityUSD = pancake.totalLiquidityFTM.times(bundle.ftmPrice);

  // now correctly set liquidity amounts for each token
  token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0);
  token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1);

  // save entities
  pair.save();
  pancake.save();
  token0.save();
  token1.save();
}

export function handleMint(event: Mint): void {

  let pair = Pair.load(event.address.toHex())
  let uniswap = SpiritswapFactory.load(FACTORY_ADDRESS)
  let bundle = Bundle.load('1')

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)

 // update txn counts
  uniswap.txCount = uniswap.txCount.plus(ONE_BI)

  uniswap.save()

  // update day entities
  let dpd = updatePairDayData(pair as Pair, event)
  let tdd0 = updateTokenDayData(token0 as Token, event, bundle as Bundle)
  let tdd1 = updateTokenDayData(token1 as Token, event, bundle as Bundle)
  dpd.save()
  tdd0.save()
  tdd1.save()

}

export function handleBurn(event: Burn): void {
  let pair = Pair.load(event.address.toHex())
  let uniswap = SpiritswapFactory.load(FACTORY_ADDRESS)
  let bundle = Bundle.load('1')

  //update token info
  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)

  // update txn counts
  uniswap.txCount = uniswap.txCount.plus(ONE_BI)

  // update global counter and save
  uniswap.save()

  // update day entities
  let dpd = updatePairDayData(pair as Pair, event)
  let tdd0 = updateTokenDayData(token0 as Token, event, bundle as Bundle)
  let tdd1 = updateTokenDayData(token1 as Token, event, bundle as Bundle)
  dpd.save()
  tdd0.save()
  tdd1.save()
}

export function handleSwap(event: Swap): void {
  let pair = Pair.load(event.address.toHexString());
  let token0 = Token.load(pair.token0);
  let token1 = Token.load(pair.token1);
  let amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals);
  let amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals);
  let amount0Out = convertTokenToDecimal(event.params.amount0Out, token0.decimals);
  let amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals);

  // totals for volume updates
  let amount0Total = amount0Out.plus(amount0In);
  let amount1Total = amount1Out.plus(amount1In);

  // FTM/USD prices
  let bundle = Bundle.load("1");

  // get total amounts of derived USD and FTM for tracking
  let derivedAmountFTM = token1.derivedFTM
    .times(amount1Total)
    .plus(token0.derivedFTM.times(amount0Total))
    .div(BigDecimal.fromString("2"));
  let derivedAmountUSD = derivedAmountFTM.times(bundle.ftmPrice);

  // only accounts for volume through white listed tokens
  let trackedAmountUSD = getTrackedVolumeUSD(amount0Total, token0 as Token, amount1Total, token1 as Token, bundle as Bundle)


  let trackedAmountFTM: BigDecimal;
  if (bundle.ftmPrice.equals(ZERO_BD)) {
    trackedAmountFTM = ZERO_BD;
  } else {
    trackedAmountFTM = trackedAmountUSD.div(bundle.ftmPrice);
  }

  // update token0 global volume and token liquidity stats
  token0.tradeVolume = token0.tradeVolume.plus(amount0In.plus(amount0Out));
  token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD);
  token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD);

  // update token1 global volume and token liquidity stats
  token1.tradeVolume = token1.tradeVolume.plus(amount1In.plus(amount1Out));
  token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD);
  token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD);

  // update txn counts
  token0.txCount = token0.txCount.plus(ONE_BI);
  token1.txCount = token1.txCount.plus(ONE_BI);

  // update pair volume data, use tracked amount if we have it as its probably more accurate
  pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD);
  pair.volumeToken0 = pair.volumeToken0.plus(amount0Total);
  pair.volumeToken1 = pair.volumeToken1.plus(amount1Total);
  pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD);
  pair.txCount = pair.txCount.plus(ONE_BI);
  pair.save();

  // update global values, only used tracked amounts for volume
  let pancake = SpiritswapFactory.load(FACTORY_ADDRESS);
  pancake.totalVolumeUSD = pancake.totalVolumeUSD.plus(trackedAmountUSD);
  pancake.totalVolumeFTM = pancake.totalVolumeFTM.plus(trackedAmountFTM);
  pancake.untrackedVolumeUSD = pancake.untrackedVolumeUSD.plus(derivedAmountUSD);
  pancake.txCount = pancake.txCount.plus(ONE_BI);

  // save entities
  pair.save();
  token0.save();
  token1.save();
  pancake.save();

  // update day entities
  let pairDayData = updatePairDayData(pair as Pair, event)
  let pancakeDayData = updateSpiritswapDayData(pancake as SpiritswapFactory, event)
  let token0DayData = updateTokenDayData(token0 as Token, event, bundle as Bundle)
  let token1DayData = updateTokenDayData(token1 as Token, event, bundle as Bundle)

  // swap specific updating
  pancakeDayData.dailyVolumeUSD = pancakeDayData.dailyVolumeUSD.plus(trackedAmountUSD);
  pancakeDayData.dailyVolumeFTM = pancakeDayData.dailyVolumeFTM.plus(trackedAmountFTM);
  pancakeDayData.dailyVolumeUntracked = pancakeDayData.dailyVolumeUntracked.plus(derivedAmountUSD);
  pancakeDayData.save();

  // swap specific updating for pair
  pairDayData.dailyVolumeToken0 = pairDayData.dailyVolumeToken0.plus(amount0Total);
  pairDayData.dailyVolumeToken1 = pairDayData.dailyVolumeToken1.plus(amount1Total);
  pairDayData.dailyVolumeUSD = pairDayData.dailyVolumeUSD.plus(trackedAmountUSD);
  pairDayData.save();

  // swap specific updating for token0
  token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total);
  token0DayData.dailyVolumeFTM = token0DayData.dailyVolumeFTM.plus(amount0Total.times(token1.derivedFTM as BigDecimal));
  token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(
    amount0Total.times(token0.derivedFTM as BigDecimal).times(bundle.ftmPrice)
  );
  token0DayData.save();

  // swap specific updating
  token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total);
  token1DayData.dailyVolumeFTM = token1DayData.dailyVolumeFTM.plus(amount1Total.times(token1.derivedFTM as BigDecimal));
  token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(
    amount1Total.times(token1.derivedFTM as BigDecimal).times(bundle.ftmPrice)
  );
  token1DayData.save();
}
