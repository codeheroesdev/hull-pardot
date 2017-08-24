import express from "express";
import { Connector } from "hull";

import server from "../../../server/server";

export default function bootstrap() {
  const app = express();
  const connector = new Connector({ hostSecret: "1234", port: 8000, clientConfig: { protocol: "http", firehoseUrl: "firehose" } });
  connector.setupApp(app);
  server(app);
  return connector.startApp(app);
}
