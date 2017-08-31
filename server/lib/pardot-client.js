// @flow
import _ from "lodash";
import axios from "axios";
import qs from "qs";
import mapDate from "../mappings/map-date";
import moment from "moment";

import SyncAgent from "./sync-agent";

export default class PardotClient {
  apiUrl: string;
  apiKey: string;
  userKey: string;
  syncAgent: SyncAgent;

  ctx: Object;

  email: string;
  password: string;

  queryParameters: any;
  apiVersion: number = 4;

  constructor(ctx: Object, syncAgent: SyncAgent) {
    this.apiUrl = process.env.OVERRIDE_PARDOT_API_URL || "https://pi.pardot.com/api";
    this.apiKey = _.get(ctx, "ship.private_settings.api_key");
    this.userKey = _.get(ctx, "ship.private_settings.user_key");
    this.syncAgent = syncAgent;

    this.ctx = ctx;

    this.email = _.get(ctx, "ship.private_settings.email");
    this.password = _.get(ctx, "ship.private_settings.password");

    this.queryParameters = () => ({ user_key: this.userKey, api_key: this.apiKey, format: "json" });
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
      if (res.status === 403) {
        return { errorInfo: _.get(res, "msg", res) };
      }

      return { errorInfo: _.get(res, "data", "Unknown Error") };
    });
  }

  // Needs pardot id for everyone
  batchUpdate(prospects: Array<Object>) {
    if (!this.isFullyConfigured()) {
      return Promise.resolve();
    }

    if (!prospects.length) {
      return Promise.resolve();
    }

    const payload = prospects.map(prospect => {
      const id = prospect["traits_pardot/id"];
      return _.merge(_.omit(prospect, ["traits_pardot/id"]), { id });
    });

    return this.request(`${this.apiUrl}/prospect/version/${this.apiVersion}/do/batchUpdate?prospects=${
      JSON.stringify({ prospects: payload })}&${this.prepareQuery(this.queryParameters())}`, "post");
  }

  // Needs email for everyone
  batchUpsert(prospects: Array<Object>) {
    if (!this.isFullyConfigured()) {
      return Promise.resolve();
    }

    if (!prospects.length) {
      return Promise.resolve();
    }

    const payload = prospects.map(prospect => _.omit(prospect, ["traits_pardot/deleted_at"]));

    return this.request(`${this.apiUrl}/prospect/version/${this.apiVersion}/do/batchUpsert?prospects=${
      JSON.stringify({ prospects: payload })}&${this.prepareQuery(this.queryParameters())}`, "post");
  }

  getCustomFields(date: string = mapDate(0), fields: Array<Object> = []) {
    if (!this.isFullyConfigured()) {
      return Promise.resolve();
    }

    return this.request(
      `${this.apiUrl}/customField/version/${this.apiVersion}/do/query?&output=bulk&sort_by=created_at&sort_order=ascending&created_after=${date}&${this.prepareQuery(this.queryParameters())}`
    ).then(res => {
      if (res && res.data && res.data.result && res.data.result.customField) {
        if (res.data.result.customField.length === 200) {
          const last = _.last(res.data.result.customField);
          return this.getCustomFields(mapDate(last.created_at), _.concat(fields, res.data.result.customField));
        }
        return _.concat(fields, res.data.result.customField);
      }
      return fields;
    });
  }

  fetchProspects(date: string = _.get(this.ctx, "ship.private_settings.last_user_updated_at", mapDate(0)), prospects: Array<Object> = []) {
    if (!this.isFullyConfigured()) {
      return Promise.resolve();
    }

    return this.request(
      `${this.apiUrl}/prospect/version/4/do/query?output=bulk&sort_by=updated_at&sort_order=ascending&updated_after=${date}&${this.prepareQuery(this.queryParameters())}`
    ).then(res => {
      if (res && res.data && res.data.result && res.data.result.prospect) {
        if (res.data.result.prospect.length === 0) {
          return { prospects: [] };
        }
        const last = _.last(res.data.result.prospect);
        if (res.data.result.prospect.length === 200) {
          return this.fetchProspects(mapDate(last.updated_at), _.concat(prospects, res.data.result.prospect));
        }
        return { prospects: _.concat(prospects, res.data.result.prospect), last_user_updated_at: mapDate(last.updated_at) };
      }
      return { prospects };
    });
  }

  fetchDeletedProspects(date: string = _.get(this.ctx, "ship.private_settings.last_user_deleted_at", mapDate(0)), deletedProspects: Array<Object> = []) {
    if (!this.isFullyConfigured()) {
      return Promise.resolve();
    }

    return this.request(
      `${this.apiUrl}/prospect/version/4/do/query?output=bulk&sort_by=updated_at&deleted=true&sort_order=ascending&updated_after=${date}&${this.prepareQuery(this.queryParameters())}`
    ).then(res => {
      if (res && res.data && res.data.result && res.data.result.prospect) {
        if (res.data.result.prospect.length === 0) {
          return { deletedProspects: [] };
        }
        const last = _.last(res.data.result.prospect);
        if (res.data.result.prospect.length === 200) {
          return this.fetchProspects(mapDate(last.updated_at), _.concat(deletedProspects, res.data.result.prospect));
        }
        return { deletedProspects: _.concat(deletedProspects, res.data.result.prospect), last_user_deleted_at: mapDate(_.get(last, "updated_at")) };
      }
      return { deletedProspects };
    });
  }

  request(url: string, method: string = "get") {
    this.ctx.client.logger.debug("pardotClient.req", { method, url });
    this.ctx.metric.increment("ship.service_api.call", 1);
    return axios({
      method,
      url,
      headers: {
        "Content-Type": "application/json"
      }
    }).then(res => {
      if (!_.isEmpty(_.get(res, "data.errors"))) {
        return Promise.reject({ msg: _.get(res, "data.errors") });
      }

      if (_.get(res, "data.@attributes.err_code") === 15) {
        return { status: 403, msg: "Invalid Credentials" };
      }

      if (_.get(res, "data.@attributes.err_code") === 1) {
        return Promise.reject({ msg: _.get(res, "data.err"), status: 403 });
      }

      const status = res.status;
      if (status > 299 || status < 200) throw new Error(`Unhandled status code: ${status}`);
      return res;
    });
  }
}
