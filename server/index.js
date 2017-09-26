import express from "express";
import Hull, { Connector } from "hull";
import { Cache } from "hull/lib/infra";
import redisStore from "cache-manager-redis";

import server from "./server";

if (process.env.LOG_LEVEL) {
  Hull.logger.transports.console.level = process.env.LOG_LEVEL;
}

let cache;


if (process.env.REDIS_URL) {
  cache = new Cache({
    store: redisStore,
    url: process.env.REDIS_URL,
    ttl: 86400
  });
} else {
  cache = new Cache({
    store: "memory",
    ttl: 86400
  });
}


const connector = new Connector({
  hostSecret: process.env.SECRET || "1234",
  port: process.env.PORT || 8082,
  cache,
  clientConfig: {
    firehoseUrl: process.env.OVERRIDE_FIREHOSE_URL
  }
});

const app = express();

connector.setupApp(app);
server(app);
connector.startApp(app);
