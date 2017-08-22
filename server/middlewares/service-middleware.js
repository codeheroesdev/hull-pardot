/* @flow */
import { Request, Response, Next } from "express";
import _ from "lodash";
import { Cluster } from "bottleneck";

import SyncAgent from "../lib/sync-agent";

export default function serviceMiddleware(bottleneckCluster: Cluster) {
  return (req: Request, res: Response, next: Next) => {
    req.hull = req.hull || {};
    req.hull.service = req.hull.service || {};

    const bottleneck = bottleneckCluster.key(_.get(req.hull, "ship.id"));
    const syncAgent = new SyncAgent(req.hull, bottleneck);

    req.hull.service = {
      syncAgent
    };

    return next();
  };
}
