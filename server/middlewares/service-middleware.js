/* @flow */
import { Request, Response, Next } from "express";

import SyncAgent from "../lib/sync-agent";

export default function serviceMiddleware() {
  return (req: Request, res: Response, next: Next) => {
    req.hull = req.hull || {};
    req.hull.service = req.hull.service || {};

    const syncAgent = new SyncAgent(req.hull);

    req.hull.service = {
      syncAgent
    };

    if (syncAgent.pardotClient.isConfiguredForAuth() && !syncAgent.pardotClient.isFullyConfigured()) {
      return syncAgent.tryAuthenticate().then(() => next());
    }

    return next();
  };
}
