// @flow
import _ from "lodash";
import axios from "axios";
import qs from "qs";
import Bottleneck from "bottleneck";
import promiseRetry from "promise-retry";

import SyncAgent from "./sync-agent";

export default class PardotClient {
  apiUrl: string;
  apiKey: string;
  userKey: string;
  syncAgent: SyncAgent;

  email: string;
  password: string;

  bottleneck: Bottleneck;
  queryParameters: any;
  apiVersion: number = 4;
  defaultFields = [
    { name: "email" },
    { name: "first_name" },
    { name: "last_name" }
  ];

  constructor(ctx: Object, bottleneck: Bottleneck, syncAgent: SyncAgent) {
    this.apiUrl = process.env.OVERRIDE_PARDOT_API_URL || "https://pi.pardot.com/api";
    this.apiKey = _.get(ctx, "ship.private_settings.api_key");
    this.userKey = _.get(ctx, "ship.private_settings.user_key");
    this.syncAgent = syncAgent;

    this.email = _.get(ctx, "ship.private_settings.email");
    this.password = _.get(ctx, "ship.private_settings.password");

    this.queryParameters = () => ({ user_key: this.userKey, api_key: this.apiKey, format: "json" });

    this.bottleneck = bottleneck;
  }

  isConfiguredForAuth() {
    return this.userKey && this.email && this.password;
  }

  isFullyConfigured() {
    return this.apiKey && this.isConfiguredForAuth();
  }

  prepareQuery(payload: any) {
    return qs.stringify(payload);
  }

  authorize() {
    if (!this.isConfiguredForAuth()) {
      return Promise.resolve();
    }
    const payload = this.prepareQuery({ email: this.email, password: this.password, user_key: this.userKey });
    return this.request(`${this.apiUrl}/login/version/${this.apiVersion}?${payload}&format=json`, "post").then(res => {
      if (res && res.data && res.data.api_key) {
        this.apiKey = res.data.api_key;
        return res.data.api_key;
      }
      return { errorInfo: res.data };
    });
  }

  // Needs pardot id for everyone
  batchUpdate(prospects: Array<Object>) {
    if (!this.isConfiguredForAuth()) {
      return Promise.resolve();
    }

    if (!prospects.length) {
      return Promise.resolve();
    }
    const payload = _.mapValues(_.keyBy(prospects, p => _.get(p, "traits_pardot/id")), value => _.omit(value, "traits_pardot/id"));
    return this.retryUnauthorized(() => {
      return this.request(`${this.apiUrl}/prospect/version/${this.apiVersion}/do/batchUpdate?prospects=${
        JSON.stringify(payload)}&${this.prepareQuery(this.queryParameters())}`, "post");
    });
  }

  // Needs email for everyone
  batchUpsert(prospects: Array<Object>) {
    if (!this.isConfiguredForAuth()) {
      return Promise.resolve();
    }

    if (!prospects.length) {
      return Promise.resolve();
    }

    return this.retryUnauthorized(() => {
      return this.request(`${this.apiUrl}/prospect/version/${this.apiVersion}/do/batchUpsert?prospects=${
        JSON.stringify({ prospects })}&${this.prepareQuery(this.queryParameters())}`, "post");
    });
  }

  upsertProspect(user: Object) {
    if (!this.isConfiguredForAuth()) {
      return Promise.resolve();
    }

    const prospectData = this.prepareQuery(_.omit(user, "email"));
    const prospectDataSuffix = () => {
      if (_.keys(prospectData).length === 0) {
        return "";
      }
      return "&";
    };
    return this.retryUnauthorized(() => {
      return this.request(
        `${this.apiUrl}/prospect/version/${this.apiVersion}/do/upsert/email/${_.get(user, "email")}?${prospectData}${prospectDataSuffix()}${this.prepareQuery(this.queryParameters())}`,
        "post"
      ).then(res => {
        if (res && res.data) {
          // TODO MAYBE RES.DATA.PROSPECT ?
          return res.data;
        }
        return {};
      });
    });
  }

  getCustomFields(offset: number = 0, fields: Array<Object> = []) {
    if (!this.isConfiguredForAuth()) {
      return Promise.resolve();
    }

    return this.retryUnauthorized(() => {
      return this.request(
        `${this.apiUrl}/customField/version/${this.apiVersion}/do/query?${this.prepareQuery(this.queryParameters())}`
      ).then(res => {
        if (res && res.data && res.data.result && res.data.result.customField) {
          if (res.data.result.customField.length === 200) {
            return this.getCustomFields(offset + 200, _.concat(fields, res.data.result.customField));
          }
          return _.concat(fields, res.data.result.customField);
        }
        return fields;
      }).then(customFields => _.concat(customFields, this.defaultFields).map(field => ({
        label: field.name,
        value: field.name
      })));
    });
  }

  fetchProspects(offset: number = 0, prospects: Array<Object> = []) {
    if (!this.isConfiguredForAuth()) {
      return Promise.resolve();
    }

    return this.retryUnauthorized(() => {
      return this.request(
        `${this.apiUrl}/prospect/version/4/do/query?offset=${offset}&${this.prepareQuery(this.queryParameters())}`
      ).then(res => {
        if (res && res.data && res.data.result && res.data.result.prospect) {
          if (res.data.result.prospect.length === 200) {
            return this.fetchProspects(offset + 200, _.concat(prospects, res.data.result.prospect));
          }
          return _.concat(prospects, res.data.result.prospect);
        }
        return prospects;
      });
    });
  }

  retryUnauthorized(promiseProvider: any) {
    return promiseRetry(retry => {
      return promiseProvider().catch(err => {
        if (err && err.status === 403) {
          return this.syncAgent.authenticate().then(() => retry(err));
        }
        return Promise.reject(err);
      });
    });
  }

  request(url: string, method: string = "get") {
    return this.bottleneck.schedule(axios.bind(this, {
      method,
      url,
      headers: {
        "Content-Type": "application/json"
      }
    })).then(res => {
      if (res && res.data && res.data.err) {
        return Promise.reject({ msg: res.data.err, status: 403 });
      }

      const status = res.status;
      if (status > 299 || status < 200) throw new Error(`Unhandled status code: ${status}`);
      return res;
    });
  }
}
