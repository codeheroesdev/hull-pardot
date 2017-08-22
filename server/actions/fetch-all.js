/* @flow */
import { Request, Response } from "express";
import _ from "lodash";

export default function ({ hull }: Request, res: Response) {
  const userAttributesMapping = _.get(hull, "ship.private_settings.sync_fields_to_hull");

  return hull.service.syncAgent.fetchProspects().then(prospects => {
    res.end("ok");
    prospects.map(prospect => {
      const userTraits = _.mapKeys(_.pick(prospect, userAttributesMapping.map(p => p.hull)), (value, key) => {
        return _.get(_.find(userAttributesMapping, mapping => mapping.hull === key), "name", key);
      });

      const asUser = hull.client.asUser({ email: prospect.email });
      return asUser.traits(userTraits)
        .then(() => {
          asUser.logger.info("incoming.user.success");
        })
        .catch(() => {
          asUser.logger.error("incoming.user.error");
        });
    });
  });
}
