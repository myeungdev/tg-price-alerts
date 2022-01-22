import { format } from 'util';
import alertManager from './alert-manager';
import * as Pairs from './static/pairs.json';
import Messages from './static/messages';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TgBot = require('node-telegram-bot-api');

const { TG_TOKEN, AUTHORIZED_TG_IDS } = process.env;

export default class TelegramBot {
  private tgBot: typeof TgBot;

  constructor() {
    if (!TG_TOKEN) {
      throw new Error('Telegram bot token is missing.');
    }
    if (!AUTHORIZED_TG_IDS) {
      throw new Error('Authorized Telegram IDs are missing.');
    }

    this.tgBot = new TgBot(TG_TOKEN, { polling: true });

    this.tgBot.onText(/\/set ([A-Z]{5,9}) (\d+\.?\d*)/, (msg, match) =>
      this.authorized(msg, match, this.onSet.bind(this)),
    );

    this.tgBot.onText(/\/list/, (msg, match) =>
      this.authorized(msg, match, this.onList.bind(this)),
    );

    this.tgBot.onText(/\/delete (\d{1,3})/, (msg, match) =>
      this.authorized(msg, match, this.onDelete.bind(this)),
    );

    this.tgBot.onText(/\/pairs ([\S]+)/, (msg, match) =>
      this.authorized(msg, match, this.onPairs.bind(this)),
    );
  }

  public sendMessage(userId, msg: string) {
    this.tgBot.sendMessage(userId, msg);
  }

  public broadcastMessage(msg: string) {
    AUTHORIZED_TG_IDS.split(',').forEach((id) =>
      this.tgBot.sendMessage(id, msg),
    );
  }

  private authorized(msg, match, cb) {
    if (AUTHORIZED_TG_IDS.indexOf(msg.chat.id) >= 0) {
      cb(msg, match);
    }
  }

  private async onList(msg) {
    const userId = msg.chat.id;
    try {
      const alerts = await alertManager.getAlerts(userId);

      const message = alerts.reduce(
        (result, alert, index) => result + `[${index + 1}] ${alert}\n`,
        '',
      );

      this.tgBot.sendMessage(userId, message || Messages.NoAlerts);
    } catch (e) {
      this.tgBot.sendMessage(userId, e.message);
    }
  }

  private async onSet(msg, match) {
    const userId = msg.chat.id.toString();
    const [_, pair, price] = match;

    try {
      if (Object.keys(Pairs).indexOf(pair.toUpperCase()) === -1) {
        throw new Error(Messages.ErrorPairNotFound);
      }

      const alertString = await alertManager.setAlert(
        userId,
        pair,
        parseFloat(price),
      );

      this.tgBot.sendMessage(userId, format(Messages.AlertSet, alertString));
    } catch (e) {
      this.tgBot.sendMessage(userId, e.message);
    }
  }

  private async onDelete(msg, match) {
    const userId = msg.chat.id.toString();
    const index = parseInt(match[1]) - 1;

    try {
      await alertManager.deleteAlertAt(userId, index);
      this.tgBot.sendMessage(userId, Messages.AlertDeleted);
    } catch (e) {
      this.tgBot.sendMessage(userId, e.message);
    }
  }

  private async onPairs(msg, match) {
    const userId = msg.chat.id.toString();
    const search = match[1].toUpperCase();
    const pairs = Object.keys(Pairs).filter(
      (pair) => pair.indexOf(search) >= 0,
    );

    this.tgBot.sendMessage(userId, pairs.join(',\n') || Messages.NoPairsFound);
  }
}
