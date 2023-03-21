import {
  SubstrateExtrinsic,
  SubstrateEvent,
  SubstrateBlock,
} from "@subql/types";
import {
  AddLiquidityEvent,
  createPoolDatasource,
  Pool,
  PoolDailySummary,
  SwapEvent,
  User,
  UserPoolData,
} from "../types";
import { Balance } from "@polkadot/types/interfaces";
import { from } from "rxjs";

async function checkCreateUser(id: string): Promise<string> {
  const cleanID = id.toLowerCase().trim();
  const user = User.get(cleanID);
  if (!user) {
    await User.create({
      id: cleanID,
    }).save();
  }
  return cleanID;
}

async function checkCreateUserPool(
  poolID: string,
  userID: string
): Promise<string> {
  const id = `${poolID.toLowerCase().trim()}-${userID.toLowerCase().trim()}`;
  const userPoolData = UserPoolData.get(id);
  if (!userPoolData) {
    await UserPoolData.create({
      id: id,
      userId: userID.toLowerCase().trim(),
      PoolId: poolID.toLowerCase().trim(),
    }).save();
  }
  return id;
}

export async function handlePoolCreated(event: SubstrateEvent): Promise<void> {
  logger.info(
    "New Pool Created at " + event.block.block.header.number.toString()
  );
  logger.info(JSON.stringify(event));
  const {
    event: {
      data: [creator, poolID, lpToken],
    },
  } = event;

  const creatorId = await checkCreateUser(creator.toString());

  await Pool.create({
    id: poolID.toString(),
    createdAtBlockHeight: event.block.block.header.number.toBigInt(),
    creatorId,
    lpToken: lpToken.toString(),
  }).save();
  await createPoolDatasource();
}

export async function handleLiquidityAdded(
  event: SubstrateEvent
): Promise<void> {
  logger.info(
    "New Liquidity Added at " + event.block.block.header.number.toString()
  );
  logger.info(JSON.stringify(event));
  const {
    event: {
      data: [
        who,
        mint_to,
        pool_id,
        amount1_provided,
        amount2_provided,
        lp_token,
        lp_token_minted,
      ],
    },
  } = event;

  const creatorID = await checkCreateUser(who.toString());
  const userPoolId = await checkCreateUserPool(pool_id.toString(), creatorID);

  await AddLiquidityEvent.create({
    id: `${event.block.block.header.number.toNumber()}-${event.idx}`,
    userPoolId,
    blockHeight: event.block.block.header.number.toBigInt(),
    amount: BigInt(amount1_provided.toString()),
    tokenAmount: BigInt(amount2_provided.toString()),
    poolTokensMinted: BigInt(lp_token_minted.toString()),
  }).save();
}

export async function handleLiquidityRemoved(
  event: SubstrateEvent
): Promise<void> {
  logger.info(
    "New Liquiditiy Removed at " + event.block.block.header.number.toString()
  );
  logger.info(JSON.stringify(event));
  const {
    event: {
      data: [
        who,
        withdraw_to,
        pool_id,
        amount1,
        amount2,
        lp_token,
        lp_token_burned,
      ],
    },
  } = event;

  const creatorID = await checkCreateUser(who.toString());
  const userPoolId = await checkCreateUserPool(pool_id.toString(), creatorID);

  await AddLiquidityEvent.create({
    id: `${event.block.block.header.number.toNumber()}-${event.idx}`,
    userPoolId,
    blockHeight: event.block.block.header.number.toBigInt(),
    amount: BigInt(amount1.toString()),
    tokenAmount: BigInt(amount2.toString()),
    poolTokensMinted: BigInt(lp_token_burned.toString()),
  }).save();
}

export async function handleSwapExecuted(event: SubstrateEvent): Promise<void> {
  logger.info("New Swap at " + event.block.block.header.number.toString());
  logger.info(JSON.stringify(event));
  const {
    event: {
      data: [who, send_to, path, amount_in, amount_out],
    },
  } = event;

  const fromId = await checkCreateUser(who.toString());
  const toId = await checkCreateUser(send_to.toString());
  //const userPoolID = await checkCreateUserPool(pool_id.toString(), creatorID);

  await SwapEvent.create({
    id: `${event.block.block.header.number.toNumber()}-${event.idx}`,
    // userPoolId: userPoolID,
    blockHeight: event.block.block.header.number.toBigInt(),
    fromId,
    toId,
    path: path.toString(),
    amountIn: BigInt(amount_in.toString()),
    amountOut: BigInt(amount_out.toString()),
  }).save();
}

export async function handleDailyUpdates(block: SubstrateBlock): Promise<void> {
  logger.info(
    "Starting daily update at " + block.block.header.number.toString()
  );
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const timestamp = BigInt(currentDate.getTime());
  const dateString: string = currentDate.toISOString().slice(0, 10);

  const dailyPoolSummaries: PoolDailySummary[] = [];
  const pools: Pool[] = await Pool.getAll();
  for (const pool of pools) {
    const swaps: SwapEvent[] = (await store.getByField(
      "SwapEvent",
      "poolID",
      pool.id
    )) as SwapEvent[];
    dailyPoolSummaries.push(
      PoolDailySummary.create({
        id: `${pool.id}-${dateString}`,
        dateString,
        timestamp,
        poolId: pool.id,
        dailyVolume: swaps.reduce((a, b) => {
          return a + b.amountIn;
        }, BigInt(0)),
        dailyFees: swaps.reduce((a, b) => {
          return a + b.amountOut;
        }, BigInt(0)),
      })
    );
  }
  await store.bulkCreate("PoolDailySummary", dailyPoolSummaries);
}
