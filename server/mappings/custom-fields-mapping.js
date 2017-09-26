// @flow
import _ from "lodash";

export function toPardot(user: Object, cache: Object = {}, shipId: string, client: Object) {
  return cache.get(`${shipId}-custom-fields`).then(fields => {
    if (fields) {
      console.log(user);
      const logger = user.email ? client.asUser({ email: user.email }).logger : client.logger;

      fields.forEach(field => {
        const fieldId = field.type_id;
        const fieldName = field.field_id;

        if (user[fieldName]) {
          if (fieldId === 8) {
            if (!_.isNumber(user[fieldName])) {
              logger.warn("outgoing.user.field.skip", { reason: `Cannot cast ${user[fieldName]} to Number value` });
              user[fieldName] = null;
              return user;
            }
          }

          if (fieldId === 1 || fieldId === 14 || fieldId === 7 || fieldId === 5 || fieldId === 14) {
            if (_.isBoolean(user[fieldName])) {
              user[fieldName] = _.toString(user[fieldName]);
              return user;
            }

            if (_.isArray(user[fieldName])) {
              user[fieldName] = user[fieldName].join(", ");
              return user;
            }

            user[fieldName] = _.toString(user[fieldName]);
            return user;
          }

          if (fieldId === 12) {
            if (!Date.parse(user[fieldName])) {
              logger.warn("outgoing.user.field.skip", { reason: `Cannot cast ${user[fieldName]} to Date` });
              user[fieldName] = null;
              return user;
            }
            return user;
          }

          if (fieldId === 6 || fieldId === 4 || fieldId === 3 || fieldId === 2) {
            if (_.isArray(user[fieldName])) {
              user[fieldName].forEach((val, idx) => {
                user[`${fieldName}_${idx}`] = val;
              });

              return user;
            }

            user[`${fieldName}_0`] = user[fieldName];
            user[fieldName] = null;
            return user;
          }
          return user;
        }
        return user;
      });
    }

    return _.pickBy(user, x => x !== null);
  })
  ;
}

export function toHull(prospect: Object) {
  return _.mapValues(prospect, val => {
    if (val && val.value) {
      return val.value;
    }
    return val;
  });
}
