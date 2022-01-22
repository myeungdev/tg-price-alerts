import MDPHubAdapter, { Connector, Topic, Subscription } from 'mdphub-adapter';
import { EventEmitter } from 'events';
import redis from './redis';
import Messages from './static/messages';
import * as Pairs from './static/pairs.json';

enum Direction {
  Above = 'above',
  Below = 'below',
}

type AlertString = string; // format: [above/below] [price] (e.g. above 68000)
type Pair = string;
type InternalRegistry = Record<
  Pair,
  Record<Direction, Record<number, string[]>>
>;

const CONNECTOR = Connector.Kkn;

export class AlertManager extends EventEmitter {
  readonly mdphubAdapter: MDPHubAdapter;
  private registry: InternalRegistry = {};
  private subscriptions: Record<Pair, Subscription> = {};
  private kknConnectionStatus: string = null;

  constructor() {
    super();

    const { MDPHUB_URL, MDPHUB_WS_PORT, MDPHUB_HTTP_PORT } = process.env;

    if (!MDPHUB_URL || !MDPHUB_WS_PORT || !MDPHUB_HTTP_PORT) {
      throw new Error(
        'MDPHub configs cannot be found in environment variables.',
      );
    }

    this.mdphubAdapter = new MDPHubAdapter(MDPHUB_URL, {
      wsPort: parseInt(MDPHUB_WS_PORT),
      httpPort: parseInt(MDPHUB_HTTP_PORT),
    });

    this.mdphubAdapter.on('ws-state-change', (snapshot) => {
      if (this.kknConnectionStatus === null) {
        this.kknConnectionStatus = snapshot.kkn;
      } else if (this.kknConnectionStatus !== snapshot.kkn) {
        this.kknConnectionStatus = snapshot.kkn;
        this.emit('connection-status-change', snapshot.kkn);
      }
    });
  }

  async init() {
    await this.mdphubAdapter.init();
    await this.buildRegistry();
  }

  async setAlert(
    userId: string,
    pair: Pair,
    price: number,
  ): Promise<AlertString> {
    const { data } = await this.mdphubAdapter.getCurrentPrice(CONNECTOR, pair);
    const currentPrice = parseFloat(data);

    if (!data || isNaN(currentPrice)) {
      throw new Error(Messages.ErrorFailedToFetchPrice);
    }

    if (price === currentPrice) {
      throw new Error(Messages.ErrorPricesAreEqual);
    }

    const direction = price > currentPrice ? Direction.Above : Direction.Below;
    const alertString: AlertString = `${Pairs[pair]} ${direction} ${price}`;
    const existingAlerts = await this.getAlerts(userId);

    if (existingAlerts.indexOf(alertString) >= 0) {
      throw new Error(Messages.ErrorAlertAlreadyExists);
    }

    await redis.client.rPush(userId, alertString);
    void this.buildRegistry();

    return alertString;
  }

  async deleteAlertAt(userId: string, index: number) {
    const item = await redis.client.lIndex(userId, index.toString());
    if (item === null) {
      throw new Error(Messages.ErrorDeletingAlertNotFound);
    } else {
      await redis.client.lRem(userId, 0, item);
    }
    void this.buildRegistry();
  }

  async deleteAlert(userId: string, alert: AlertString) {
    await redis.client.lRem(userId, 0, alert);
  }

  async getAlerts(userId): Promise<AlertString[]> {
    const key = userId.toString();
    return (await redis.client.lRange(key, 0, -1)) || [];
  }

  private async buildRegistry() {
    const registry: InternalRegistry = {};

    const allUserIds = await redis.client.keys('*');

    for (const userId of allUserIds) {
      const alerts = await this.getAlerts(userId);

      for (const alert of alerts) {
        const [pair, direction, price] = alert.split(' ');

        registry[pair] = {
          ...(registry[pair] ?? {}),
          [direction]: {
            ...(registry[pair] && registry[pair][direction]
              ? registry[pair][direction]
              : {}),
            [price]: [
              ...(registry[pair] &&
              registry[pair][direction] &&
              registry[pair][direction][price]
                ? registry[pair][direction][price]
                : []),
              userId,
            ],
          },
        } as Record<Direction, Record<number, string[]>>;
      }
    }

    this.registry = registry;
    this.refreshSubscriptions();
  }

  private refreshSubscriptions() {
    const pairsNeeded = Object.keys(this.registry);
    const pairsNotNeeded = Object.keys(this.subscriptions).filter(
      (pair) => !pairsNeeded.includes(pair),
    );

    pairsNeeded.forEach((pair) => {
      if (!this.subscriptions[pair]) {
        this.subscriptions[pair] = this.mdphubAdapter.subscribe(CONNECTOR, {
          symbol: pair,
          topic: Topic.Trade,
          cb: this.onTradeReceived.bind(this),
        });
      }
    });
    pairsNotNeeded.forEach((pair) => {
      this.subscriptions[pair].unsubscribe();
      delete this.subscriptions[pair];
    });
  }

  private async onTradeReceived(data) {
    // if (data.type === 'trade') {
    const pair = data.payload[3];
    const currentPrice = parseFloat(data.payload[1][0]); // TODO: Can be improved by sorting the array first
    const alertsByDirection = this.registry[pair];

    if (!alertsByDirection) {
      console.error("Price received but pair doesn't exist in registry.");
      return;
    }

    for (const ap in alertsByDirection.below) {
      const alertPrice = parseFloat(ap);
      if (currentPrice <= alertPrice) {
        const alertUserIds = alertsByDirection.below[ap];

        this.emit(
          'alert',
          alertUserIds,
          pair,
          Direction.Below,
          alertPrice,
          currentPrice,
        );

        for (const userId of alertUserIds) {
          await this.deleteAlert(
            userId,
            `${pair} ${Direction.Below} ${alertPrice}`,
          );
        }

        void this.buildRegistry();
      }
    }

    for (const ap in alertsByDirection.above) {
      const alertPrice = parseFloat(ap);

      if (currentPrice >= alertPrice) {
        const alertUserIds = alertsByDirection.above[ap];
        this.emit(
          'alert',
          alertUserIds,
          pair,
          Direction.Above,
          alertPrice,
          currentPrice,
        );

        for (const userId of alertUserIds) {
          await this.deleteAlert(
            userId,
            `${pair} ${Direction.Above} ${alertPrice}`,
          );
        }

        void this.buildRegistry();
      }
    }
    // }
  }
}

export default new AlertManager();
