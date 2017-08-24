import nock from "nock";

module.exports = function mocks(apiKey: string, userKey: string) {
  const API_PREFIX = "https://pi.pardot.com/api";
  const API_KEY = apiKey;
  const USER_KEY = userKey;
  return {
    setUpAuthenticationNock: (email, password) => nock(API_PREFIX)
      .post("/login/version/4")
      .query({
        email,
        password,
        format: "json",
        user_key: USER_KEY
      })
      .reply(200, {
        api_key: API_KEY
      }),
    setUpCustomFieldsNock: (date) => nock(API_PREFIX)
      .get("/customField/version/4/do/query")
      .query({
        user_key: USER_KEY,
        api_key: API_KEY,
        format: "json",
        output: "bulk",
        sort_by: "created_at",
        sort_order: "ascending",
        created_after: date
      })
      .reply(200, {
        result: {
          customField: [
            {
              id: 123,
              name: "Some Custom Field",
              field_id: "custom_Field",
              created_at: date
            }
          ]
        }
      }),
    setUpFetchProspectsNock: (date) => nock(API_PREFIX)
      .get("/prospect/version/4/do/query")
      .query({
        user_key: USER_KEY,
        api_key: API_KEY,
        format: "json",
        output: "bulk",
        sort_by: "updated_at",
        sort_order: "ascending",
        updated_after: date
      })
      .reply(200, {
        result: {
          prospect: [
            {
              id: 123,
              name: "Customer",
              email: "test@email.com",
              created_at: "2017-08-03 18:33:43"
            }
          ]
        }
      }),
    setUpUpsertBatchNock: (prospects, callback) => {
      const payload = JSON.stringify({ prospects: [...prospects] });
      return nock(API_PREFIX)
        .post("/prospect/version/4/do/batchUpsert")
        .query({
          prospects: payload,
          user_key: USER_KEY,
          api_key: API_KEY,
          format: "json"
        })
        .reply(200, () => {
          if (callback) {
            callback();
          }
          return {};
        });
    },
    setUpUpdateBatchNock: (prospectsObject, callback) => {
      const payload = JSON.stringify(prospectsObject);
      return nock(API_PREFIX)
        .post("/prospect/version/4/do/batchUpdate")
        .query({
          prospects: payload,
          user_key: USER_KEY,
          api_key: API_KEY,
          format: "json"
        })
        .reply(200, () => {
          if (callback) {
            callback();
          }
          return {};
        });
    }
  };
};
