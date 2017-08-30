/* @flow */
import _ from "lodash";
import promiseRetry from "promise-retry";
import moment from "moment";

import PardotClient from "./pardot-client";
import defaultFields from "../mappings/default-fields";
import inboundFields from "../mappings/inbound-fields";

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
        return this.client.logger.error("fetch.api.key.error", { errors: api_key.errorInfo });
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
      } else if (_.get(user, "traits_pardot/updated_at")) {
        if (_.get(user, "email")) {
          this.client.asUser(user).logger.info("outgoing.user.skip", { reason: "User was already sent to Pardot but we didn't fetch his Id. Please wait until next fetch or trigger it on dashboard." });
        } else {
          this.client.logger.info("outgoing.user.skip", {
            user: _.pick(user, ["external_id", "anonymous_id", "id"]),
            reason: "User was already sent to Pardot but we didn't fetch his Id. Please wait until next fetch or trigger it on dashboard."
          });
        }
      } else if (_.get(user, "email")) {
        usersToSend.push(this.mapUserAttributes(user));
      } else {
        this.client.logger.info("outgoing.user.skip", { user: _.pick(user, ["external_id", "anonymous_id", "id"]), reason: "User was never sent to Pardot before and he is missing email for identification" });
      }
    });

    return Promise.all(
      _.chunk(usersToSend, 50).map(chunkedUsers =>
        this.retryUnauthorized(() => this.pardotClient.batchUpsert(chunkedUsers))
          .then(() => chunkedUsers.forEach(user => {
            const asUser = this.client.asUser(user);
            return asUser.traits(_.mapKeys(_.merge(user, { updated_at: moment().format() }), (value, key) => `pardot/${key}`))
              .then(
                () => asUser.logger.info("outgoing.user.success"),
                (err) => asUser.logger.error("outgoing.user.error", { errors: err }));
          }))
          .then(() => this.metric.increment("ship.incoming.users", chunkedUsers.length))
          .catch(err => {
            if (err.msg) {
              // handle succeeded users
              chunkedUsers.map((value, key) => key.toString()).filter(key => !_.includes(_.keys(err.msg), key))
                .forEach(idx => this.client.asUser(chunkedUsers[idx]).logger.info("outgoing.user.success"));

              // handle failed users
              return _.keys(err.msg).forEach(idx => this.client.asUser(chunkedUsers[idx]).logger.error("outgoing.user.error", { errors: _.get(err.msg, idx) }));
            }
            return this.client.logger.error("outgoing.users.error", { users: chunkedUsers, errors: err });
          }))
    ).then(() => Promise.all(
      _.chunk(usersAlreadySent, 50).map(chunkedUsers =>
        this.retryUnauthorized(() => this.pardotClient.batchUpdate(chunkedUsers))
          .then(() => chunkedUsers.forEach(user => {
            if (_.get(user, "email")) {
              const asUser = this.client.asUser(user);
              return asUser.traits(_.mapKeys(_.merge(_.omit(user, "traits_pardot/id"), { updated_at: moment().format() }), (value, key) => `pardot/${key}`))
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
          .catch(err => {
            if (err.msg) {
              // handle succeeded users
              chunkedUsers.map((value, key) => key.toString()).filter(key => !_.includes(_.keys(err.msg), key))
                .forEach(idx => {
                  if (_.get(chunkedUsers[idx], "email")) {
                    return this.client.asUser(chunkedUsers[idx]).logger.info("outgoing.user.success");
                  }
                  return this.client.logger.info("outgoing.user.success", {
                    user: _.pick(chunkedUsers[idx], ["traits_pardot/id", "email"])
                  });
                });

              // handle failed users
              return _.keys(err.msg).forEach(idx => this.client.logger.error("outgoing.user.error", {
                user: _.pick(chunkedUsers[idx], ["traits_pardot/id", "email"]),
                errors: err
              }));
            }
            return this.client.logger.error("outgoing.users.error", { users: chunkedUsers, errors: err });
          }))
    ));
  }

  getCustomFields(direction: string) {
    return this.retryUnauthorized(() => this.pardotClient.getCustomFields())
      .then(result => {
        let fields = _.concat(result, defaultFields());
        if (direction === "outbound") {
          fields = fields.filter(opt => opt.field_id !== "id" && opt.field_id !== "score");
        }

        if (direction === "inbound") {
          fields = _.concat(fields, inboundFields());
        }

        return fields.map(field => ({
          label: field.name,
          value: field.field_id
        }));
      })
      .catch(err => this.client.logger.debug("incoming.custom.fields", { errors: err }));
  }

  fetchProspects(date: string) {
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
