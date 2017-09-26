import { Request, Response } from "express";
import _ from "lodash";

export default function (req: Request, res: Response) {
  const { ship, client, service = {} } = req.hull;
  const messages = [];
  let status = "ok";
  const pushMessage = message => {
    status = "error";
    messages.push(message);
  };
  const promises = [];

  if (!ship || !ship.private_settings || !client) {
    pushMessage("Connector is missing configuration");
  }

  if (!_.get(ship, "private_settings.user_key")) {
    pushMessage("Missing API User Key");
  }

  if (!_.get(ship, "private_settings.email")) {
    pushMessage("Missing Pardot Email");
  }

  if (!_.get(ship, "private_settings.password")) {
    pushMessage("Missing Pardot Password");
  }

  if (_.isEmpty(_.get(ship, "private_settings.sync_fields_to_pardot", []))) {
    pushMessage("No fields are going to be sent from Hull to Pardot because of missing configuration");
  }

  if (_.isEmpty(_.get(ship, "private_settings.sync_fields_to_hull", []))) {
    pushMessage("No fields are going to be sent from Pardot to Hull because of missing configuration");
  }

  if (_.isEmpty(_.get(ship, "private_settings.synchronized_segments", []))) {
    pushMessage("No segments will be synchronized because of missing configuration");
  }

  if (!_.get(ship, "private_settings.api_key")) {
    pushMessage("Missing Pardot Api Key");
    if (service.syncAgent.pardotClient.isConfiguredForAuth()) {
      promises.push(service.syncAgent.pardotClient.authorize().then(result => {
        if (result && result.errorInfo) {
          return pushMessage(result.errorInfo);
        }
        return result;
      }).catch(err => {
        if (err.status === 403) {
          return pushMessage("Invalid Api Key");
        }
        return pushMessage(`Could not get response from Pardot due to error: ${_.get(err, "message", "Unknown Error")}`);
      }));
    }
  } else {
    if (service.syncAgent) {
      promises.push(service.syncAgent.pardotClient.getCustomFields().then(fields => {
        if (fields && !fields.length) {
          return pushMessage("Pardot returned no results");
        }

        return fields;
      }).catch(err => {
        if (err.status === 403) {
          return pushMessage("Invalid Api Key");
        }
        return pushMessage(`Could not get response from Pardot due to error: ${_.get(err, "message", "Unknown Error")}`);
      }));
    } else {
      pushMessage("Connector is missing configuration");
    }
  }

  return Promise.all(promises).then(() => {
    res.json({ status, messages: _.uniq(messages) });
    return client.put(`${ship.id}/status`, { status, messages: _.uniq(messages) });
  });
}
