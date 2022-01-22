import { createClient } from 'redis';

class Redis {
  private redisClient;

  async init() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost',
    });
    await this.redisClient.connect();
  }

  get client() {
    return this.redisClient;
  }
}

export default new Redis();
