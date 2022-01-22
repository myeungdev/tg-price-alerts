import 'dotenv/config';
import { format } from 'util';
import redis from './redis';
import TelegramBot from './telegram-bot';
import alertManager from './alert-manager';
import Messages from './static/messages';

(async () => {
  await redis.init();
  const telegramBot = new TelegramBot();
  const onConnectionStatusChange = (state) => {
    telegramBot.broadcastMessage(
      format(Messages.ConnectionStatusChanged, state.toUpperCase()),
    );
  };
  const onAlert = (userIds, pair, direction, alertPrice, currentPrice) => {
    userIds.forEach((userId) => {
      telegramBot.sendMessage(
        userId,
        format(Messages.Alert, pair, direction, alertPrice, currentPrice),
      );
    });
  };

  alertManager.on('connection-status-change', onConnectionStatusChange);
  alertManager.on('alert', onAlert);
  await alertManager.init();
})();
