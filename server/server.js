/* @flow */
import express from "express";
import { notifHandler, smartNotifierHandler } from "hull/lib/utils";
import cors from "cors";
import mapDate from "./mappings/map-date";

import requireConfiguration from "./middlewares/require-configuration";
import serviceMiddleware from "./middlewares/service-middleware";
import * as actions from "./actions";

export default function server(app: express) {
  app.use(serviceMiddleware());

  app.use("/status", actions.statusCheck);

  app.use("/admin.html", (req, res) => {
    if (req.hull.service.syncAgent.pardotClient.isConfiguredForAuth() && !req.hull.service.syncAgent.pardotClient.isFullyConfigured()) {
      res.render("admin.html", { message: "We are authenticating you with Pardot. Check logs for more details." });
    } else if (req.hull.service.syncAgent.pardotClient.isFullyConfigured()) {
      res.render("authenticated.html");
    } else {
      res.render("admin.html", { message: "Please configure all authentication details in Settings tab. If all settings are set please wait until changes will be applied to the platform." });
    }
  });

  app.use(requireConfiguration);

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
      "user:update": actions.updateUser
    }
  }));

  app.use("/smart-notifier", smartNotifierHandler({
    handlers: {
      "user:update": (ctx: Object, messages: Array<Object>) => {
        ctx.smartNotifierResponse.setFlowControl({
          type: "next",
          in: 1000
        });
        return actions.updateUser(ctx, messages);
      },
      "ship:update": (ctx: Object, messages: Array<Object>) => {
        // FIXME: when using `smartNotifierHandler` the ship object is not refreshed
        // in the cashed correctly, until it's done in hull-node we do it explicitly here:
        return ctx.cache.del(ctx.ship.id);
      }
    }
  }));

  app.use("/schema/inbound_custom_fields", cors(), actions.customFields("inbound"));
  app.use("/schema/outbound_custom_fields", cors(), actions.customFields("outbound"));

  app.use("/fetchAll", actions.fetchAll(mapDate(0)));

  app.use("/fetch", actions.fetchAll());

  return app;
}
