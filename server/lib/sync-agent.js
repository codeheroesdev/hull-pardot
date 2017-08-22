/* @flow */
import Bottleneck from "bottleneck";
import _ from "lodash";

import PardotClient from "./pardot-client";

/**
 * SyncAgent performs logic
 */
export default class SyncAgent {
  pardotClient: PardotClient;
  ctx: Object;
  userAttributesMapping: Array<Object>;

  constructor(ctx: Object, bottleneck: Bottleneck) {
    this.pardotClient = new PardotClient(ctx, bottleneck, this);
    this.ctx = ctx;
    this.userAttributesMapping = _.get(ctx, "ship.private_settings.sync_fields_to_pardot");
  }

  authenticate() {
    return this.pardotClient.authorize().then(api_key => {
      if (api_key && api_key.errorInfo) {
        return this.ctx.client.logger.debug("fetch.api.key.error", { errors: api_key.errorInfo });
      }
      if (api_key) {
        return this.ctx.helpers.updateSettings({ api_key });
      }
      return api_key;
    });
  }

  mapUserAttributes(user: Object) {
    let result = _.mapKeys(_.pick(user, this.userAttributesMapping.map(p => p.hull)), (value, key) => {
      return _.get(_.find(this.userAttributesMapping, mapping => mapping.hull === key), "name", key);
    });

    if (user && user.email) {
      result = _.merge({ email: user.email }, result);
    }

    if (user && _.get(user, "traits_pardot/id")) {
      result = _.merge({ "traits_pardot/id": _.get(user, "traits_pardot/id") }, result);
    }

    return result;
  }

  sendUsersBatch(users: Array<Object>) {
    const usersAlreadySent = [];
    const usersToSend = [];

    users.forEach(user => {
      if (_.get(user, "traits_pardot/id")) {
        usersAlreadySent.push(this.mapUserAttributes(user));
      } else if (_.get(user, "email")) {
        usersToSend.push(this.mapUserAttributes(user));
      } else {
        this.ctx.client.logger.info("outgoing.user.skip", { reason: "User was never sent to Pardot before and he is missing email for identification" });
      }
    });

    return Promise.all(_.chunk(usersToSend, 50).map(chunkedUsers => this.pardotClient.batchUpsert(chunkedUsers))).then(() =>
      Promise.all(_.chunk(usersAlreadySent, 50).map(chunkedUsers => this.pardotClient.batchUpdate(chunkedUsers))));
  }

  upsertProspect(user: Object) {
    if (!_.get(user, "email")) {
      this.ctx.client.logger.info("outgoing.user.skip", { reason: "Missing email" });
      return Promise.resolve({});
    }

    return this.pardotClient.upsertProspect(this.mapUserAttributes(user));
  }

  getCustomFields() {
    return this.pardotClient.getCustomFields();
  }

  fetchProspects() {
    return this.pardotClient.fetchProspects();
  }

}
