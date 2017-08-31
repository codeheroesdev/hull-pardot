import express from "express";
import { Connector } from "hull";
import { Cache } from "hull/lib/infra";

import server from "../../../server/server";

const cache = new Cache({
  store: "memory",
  ttl: 86400
});

export default function bootstrap() {
  const app = express();
  const connector = new Connector({ hostSecret: "1234", port: 8000, clientConfig: { protocol: "http", firehoseUrl: "firehose" }, cache });
  connector.setupApp(app);
  server(app);
  return connector.startApp(app);
}
