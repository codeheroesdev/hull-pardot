/* @flow */
import _ from "lodash";

export default function updateUser({ client = {}, ship = {}, service: { syncAgent } }: Object, messages: []) {
  const segmentsFilter = _.get(ship, "private_settings.synchronized_segments", []);
  const filteredUsers = messages.filter(m => {
    if (!_.get(m.changes, "user['traits_pardot/updated_at'][1]", false)) {
      if (_.intersection(m.segments.map(s => s.id), segmentsFilter).length === 0) {
        if (!_.isEmpty(_.pick(m.user, ["email", "id", "external_id"]))) {
          client.asUser(m.user).logger.info("outgoing.user.skip", { reason: "User is not included in synchronized segments setting" });
          return false;
        }
        client.logger.info("outgoing.user.skip", { reason: "User is not included in synchronized segments setting" });
        return false;
      }
    } else {
      client.logger.info("outgoing.user.skip", { reason: "User already sent to Pardot, avoiding loop" });
      return false;
    }

    if (_.get(m.user, "traits_pardot/deleted_at")) {
      if (!_.isEmpty(_.pick(m.user, ["email", "id", "external_id"]))) {
        client.asUser(m.user).logger.info("outgoing.user.skip", { reason: "User was deleted from Pardot" });
        return false;
      }
      client.logger.info("outgoing.user.skip", { reason: "User was deleted from Pardot" });
      return false;
    }

    return true;
  }).map(m => m.user);

  return syncAgent.sendUsersBatch(filteredUsers);
}
