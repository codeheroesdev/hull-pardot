/* @flow */
import _ from "lodash";

export default function updateUser({ client = {}, ship = {}, service: { syncAgent } }: Object, messages: []) {
  const segmentsFilter = _.get(ship, "private_settings.synchronized_segments", []);
  const filteredUsers = messages.filter(m => {
    if (_.intersection(m.segments.map(s => s.id), segmentsFilter).length === 0) {
      client.logger.info("outgoing.user.skip", { reason: "User is not included in synchronized segments setting" });
      return false;
    }
    return true;
  }).map(m => m.user);

  return syncAgent.sendUsersBatch(filteredUsers);
}
