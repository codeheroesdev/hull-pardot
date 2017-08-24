import express from "express";
import Hull, { Connector } from "hull";

import server from "./server";

if (process.env.LOG_LEVEL) {
  Hull.logger.transports.console.level = process.env.LOG_LEVEL;
}

const connector = new Connector({
  hostSecret: process.env.SECRET || "1234",
  port: process.env.PORT || 8082,
});

const app = express();

connector.setupApp(app);
server(app);
connector.startApp(app);
