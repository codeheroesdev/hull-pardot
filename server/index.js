import express from "express";
import Hull, { Connector } from "hull";
import { Cluster } from "bottleneck";

import server from "./server";

if (process.env.LOG_LEVEL) {
  Hull.logger.transports.console.level = process.env.LOG_LEVEL;
}

const connector = new Connector({
  hostSecret: process.env.SECRET || "1234",
  port: process.env.PORT || 8082,
});

const app = express();
const bottleneckCluster = new Cluster(10, 3600);

connector.setupApp(app);
server(app, bottleneckCluster);
connector.startApp(app);
