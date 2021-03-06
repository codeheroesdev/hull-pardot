/* @flow */
import { Request, Response, Next } from "express";
import _ from "lodash";

export default function requireConfiguration(req: Request, res: Response, next: Next) {
  if (req.hull.message && req.hull.message.Type === "SubscriptionConfirmation") {
    return next();
  }

  if (!_.get(req.hull, "client")) {
    return res.status(403).send("Connector is not configured");
  }

  if (!req.hull.service.syncAgent.pardotClient.isFullyConfigured()) {
    req.hull.client.logger.error("connector.configuration.error", { errors: "connector not configured" });
    return res.status(403).send("Connector is not configured");
  }
  return next();
}
