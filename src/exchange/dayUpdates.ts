/* eslint-disable prefer-const */
import { BigInt, BigDecimal, ethereum } from "@graphprotocol/graph-ts";
import {
  Pair,
  Bundle,
  Token,
  SpiritswapFactory,
  SpiritswapDayData,
  PairDayData,
  TokenDayData,
} from "../types/schema";
import { ONE_BI, ZERO_BD, ZERO_BI, FACTORY_ADDRESS } from "./utils";

export function updateSpiritswapDayData(pancake: SpiritswapFactory, event: ethereum.Event): SpiritswapDayData {
  //let pancake = SpiritswapFactory.load(FACTORY_ADDRESS);
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let pancakeDayData = SpiritswapDayData.load(dayID.toString());
  if (pancakeDayData === null) {
    pancakeDayData = new SpiritswapDayData(dayID.toString());
    pancakeDayData.date = dayStartTimestamp;
    pancakeDayData.dailyVolumeUSD = ZERO_BD;
    pancakeDayData.dailyVolumeFTM = ZERO_BD;
    pancakeDayData.totalVolumeUSD = ZERO_BD;
    pancakeDayData.totalVolumeFTM = ZERO_BD;
    pancakeDayData.dailyVolumeUntracked = ZERO_BD;
  }

  pancakeDayData.totalLiquidityUSD = pancake.totalLiquidityUSD;
  pancakeDayData.totalLiquidityFTM = pancake.totalLiquidityFTM;
  pancakeDayData.txCount = pancake.txCount;
  //pancakeDayData.save();

  return pancakeDayData as SpiritswapDayData;
}

export function updatePairDayData(pair: Pair, event: ethereum.Event): PairDayData {
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let dayPairID = event.address.toHexString().concat("-").concat(BigInt.fromI32(dayID).toString());
  //let pair = Pair.load(event.address.toHexString());
  let pairDayData = PairDayData.load(dayPairID);
  if (pairDayData === null) {
    pairDayData = new PairDayData(dayPairID);
    pairDayData.date = dayStartTimestamp;
    pairDayData.token0 = pair.token0;
    pairDayData.token1 = pair.token1;
    pairDayData.pairAddress = event.address;
    pairDayData.dailyVolumeToken0 = ZERO_BD;
    pairDayData.dailyVolumeToken1 = ZERO_BD;
    pairDayData.dailyVolumeUSD = ZERO_BD;
    pairDayData.dailyTxns = ZERO_BI;
  }

  pairDayData.totalSupply = pair.totalSupply;
  pairDayData.reserve0 = pair.reserve0;
  pairDayData.reserve1 = pair.reserve1;
  pairDayData.reserveUSD = pair.reserveUSD;
  pairDayData.dailyTxns = pairDayData.dailyTxns.plus(ONE_BI);
  //pairDayData.save();

  return pairDayData as PairDayData;
}


export function updateTokenDayData(token: Token, event: ethereum.Event, bundle: Bundle): TokenDayData {
  //let bundle = Bundle.load("1");
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let tokenDayID = token.id.toString().concat("-").concat(BigInt.fromI32(dayID).toString());

  let tokenDayData = TokenDayData.load(tokenDayID);
  if (tokenDayData === null) {
    tokenDayData = new TokenDayData(tokenDayID);
    tokenDayData.date = dayStartTimestamp;
    tokenDayData.token = token.id;
    tokenDayData.priceUSD = token.derivedFTM.times(bundle.ftmPrice);
    tokenDayData.dailyVolumeToken = ZERO_BD;
    tokenDayData.dailyVolumeFTM = ZERO_BD;
    tokenDayData.dailyVolumeUSD = ZERO_BD;
    tokenDayData.dailyTxns = ZERO_BI;
    tokenDayData.totalLiquidityUSD = ZERO_BD;
  }
  tokenDayData.priceUSD = token.derivedFTM.times(bundle.ftmPrice);
  tokenDayData.totalLiquidityToken = token.totalLiquidity;
  tokenDayData.totalLiquidityFTM = token.totalLiquidity.times(token.derivedFTM as BigDecimal);
  tokenDayData.totalLiquidityUSD = tokenDayData.totalLiquidityFTM.times(bundle.ftmPrice);
  tokenDayData.dailyTxns = tokenDayData.dailyTxns.plus(ONE_BI);
  //tokenDayData.save();

  /**
   * @todo test if this speeds up sync
   */
  // updateStoredTokens(tokenDayData as TokenDayData, dayID)
  // updateStoredPairs(tokenDayData as TokenDayData, dayPairID)

  return tokenDayData as TokenDayData;
}
