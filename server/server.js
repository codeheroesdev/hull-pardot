/* @flow */
import express from "express";
import { Cluster } from "bottleneck";
import { notifHandler } from "hull/lib/utils";
import cors from "cors";

import requireFullConfiguration from "./middlewares/check-connector-configuration";
import serviceMiddleware from "./middlewares/service-middleware";
import * as actions from "./actions";

export default function server(app: express, bottleneckCluster: Cluster) {
  app.use(serviceMiddleware(bottleneckCluster));
  app.use(requireFullConfiguration);

  app.use("/batch", notifHandler({
    userHandlerOptions: {
      groupTraits: false
    },
    handlers: {
      "user:update": actions.batchHandler
    }
  }));

  app.use("/notify", notifHandler({
    userHandlerOptions: {
      groupTraits: false
    },
    handlers: {
      "user:update": actions.notifyHandler
    }
  }));

  app.use("/schema/custom_fields", cors(), actions.customFields);

  return app;
}
