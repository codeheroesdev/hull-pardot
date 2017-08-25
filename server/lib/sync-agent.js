/* @flow */
import _ from "lodash";
import promiseRetry from "promise-retry";

import PardotClient from "./pardot-client";
import defaultFields from "../mappings/default-fields";

/**
 * SyncAgent performs logic
 */
export default class SyncAgent {
  pardotClient: PardotClient;
  client: Object;
  helpers: Object;
  metric: Object;
  userAttributesMapping: Array<Object>;

  constructor(ctx: Object) {
    this.pardotClient = new PardotClient(ctx, this);
    this.client = _.get(ctx, "client");
    this.helpers = _.get(ctx, "helpers");
    this.metric = _.get(ctx, "metric");
    this.userAttributesMapping = _.get(ctx, "ship.private_settings.sync_fields_to_pardot");
  }

  tryAuthenticate() {
    return promiseRetry(retry => {
      return this.authenticate().catch(err => {
        return this.authenticate().then(() => retry(err));
      });
    }, { retries: 3 });
  }

  authenticate() {
    return this.pardotClient.authorize().then(api_key => {
      if (api_key && api_key.errorInfo) {
        return this.client.logger.debug("fetch.api.key.error", { errors: api_key.errorInfo });
      }
      if (api_key) {
        return this.helpers.updateSettings({ api_key });
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
        this.client.logger.info("outgoing.user.skip", { reason: "User was never sent to Pardot before and he is missing email for identification" });
      }
    });

    return Promise.all(
      _.chunk(usersToSend, 50).map(chunkedUsers =>
        this.retryUnauthorized(() => this.pardotClient.batchUpsert(chunkedUsers))
          .then(() => chunkedUsers.forEach(user => {
            const asUser = this.client.asUser(user);
            return asUser.traits(_.mapKeys(user, (value, key) => `pardot/${key}`))
              .then(
                () => asUser.logger.info("outgoing.user.success"),
                (err) => asUser.logger.error("outgoing.user.error", { errors: err }));
          }))
          .then(() => this.metric.increment("ship.incoming.users", chunkedUsers.length))
          .catch(err => chunkedUsers.forEach(user => this.client.asUser(user).logger.error("outgoing.user.error", { errors: err }))))
    ).then(() => Promise.all(
      _.chunk(usersAlreadySent, 50).map(chunkedUsers =>
        this.retryUnauthorized(() => this.pardotClient.batchUpdate(chunkedUsers))
          .then(() => chunkedUsers.forEach(user => {
            if (_.get(user, "email")) {
              const asUser = this.client.asUser(user);
              return asUser.traits(_.mapKeys(_.omit(user, "traits_pardot/id"), (value, key) => `pardot/${key}`))
                .then(
                  () => asUser.logger.info("outgoing.user.success"),
                  (err) => asUser.logger.error("outgoing.user.error", { errors: err }));
            }
            return this.client.logger.info("outgoing.user.success", {
              sentTraits: false,
              reason: "Missing email but sent with pardot id",
              user: _.pick(user, ["traits_pardot/id", "email"])
            });
          }))
          .then(() => this.metric.increment("ship.incoming.users", chunkedUsers.length))
          .catch(err => chunkedUsers.forEach(user => this.client.logger.error("outgoing.user.error", {
            user: _.pick(user, ["traits_pardot/id", "email"]),
            errors: err
          }))))
    ));
  }

  getCustomFields() {
    return this.retryUnauthorized(() => this.pardotClient.getCustomFields())
      .then(result => _.concat(result, defaultFields()).filter(f => f.field_id !== "id" || f.field_id !== "score").map(field => ({
        label: field.name,
        value: field.field_id
      })))
      .catch(err => this.client.logger.debug("incoming.custom.fields", { errors: err }));
  }

  fetchProspects(date) {
    return this.retryUnauthorized(() => this.pardotClient.fetchProspects(date))
      .then(({ prospects, last_user_updated_at }) => {
        if (last_user_updated_at) {
          this.helpers.updateSettings({ last_user_updated_at });
        }
        return prospects;
      })
      .catch(err => this.client.logger.debug("incoming.prospects", { errors: err }));
  }

  retryUnauthorized(promiseProvider: any) {
    return promiseRetry(retry => {
      return promiseProvider().catch(err => {
        if (err && err.status === 403) {
          return this.authenticate().then(() => retry(err));
        }
        return Promise.reject(err);
      });
    }, { retries: 3 });
  }

}
