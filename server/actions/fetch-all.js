/* @flow */
import { Request, Response } from "express";
import _ from "lodash";

export default function (date: string) {
  return ({ hull }: Request, res: Response) => {
    const userAttributesMapping = _.get(hull, "ship.private_settings.sync_fields_to_hull");
    let successfullUsers = 0;
    return hull.service.syncAgent.fetchProspects(date).then(prospects => {
      res.end("ok");

      return Promise.all(prospects.map(prospect => {
        if (!_.get(prospect, "email")) {
          hull.client.logger.info("incoming.user.skip", { reason: "Missing email" });
          return Promise.resolve();
        }

        const userTraits = _.mapKeys(_.pick(prospect, userAttributesMapping.map(p => p.name)), (value, key) => {
          return _.get(_.find(userAttributesMapping, mapping => mapping.name === key), "hull", key);
        });

        _.merge(userTraits, { id: prospect.id });

        const asUser = hull.client.asUser({ email: prospect.email });
        return asUser.traits(userTraits)
          .then(() => {
            successfullUsers += 1;
            return asUser.logger.info("incoming.user.success");
          })
          .catch(() => asUser.logger.error("incoming.user.error"));
      }).then(() => hull.metric.increment("ship.incoming.users", successfullUsers)));
    }).catch(err => {
      hull.client.logger.debug("incoming.fetch.error", { errors: err });
      return res.end("error");
    });
  };
}
