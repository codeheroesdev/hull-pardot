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
    setUpUpsertProspectNock: (email, userData) => nock(API_PREFIX)
      .post(`/prospect/version/4/do/upsert/email/${email}`)
      .query({
        user_key: USER_KEY,
        api_key: API_KEY,
        format: "json",
        ...userData
      })
      .reply(201, {
        prospect: {
          id: "123",
          email: "test@email.com"
        }
      }),
    setUpCustomFieldsNock: () => nock(API_PREFIX)
      .get("/customField/version/4/do/query")
      .query({
        user_key: USER_KEY,
        api_key: API_KEY,
        format: "json"
      })
      .reply(200, {
        result: {
          total_results: 1,
          customField: [
            {
              id: 123,
              name: "Some Custom Field",
              field_id: "Custom_Field"
            }
          ]
        }
      }),
    setUpFetchProspectsNock: () => nock(API_PREFIX)
      .get("/prospect/version/4/do/query")
      .query({
        user_key: USER_KEY,
        api_key: API_KEY,
        format: "json",
        offset: 0
      })
      .reply(200, {
        result: {
          total_results: 1,
          prospect: [
            {
              id: 123,
              name: "Some Custom Field",
              field_id: "Custom_Field"
            }
          ]
        }
      }),
    setUpUpsertBatchNock: (prospects) => {
      const payload = JSON.stringify({ prospects: [...prospects] });
      return nock(API_PREFIX)
        .post("/prospect/version/4/do/batchUpsert")
        .query({
          prospects: payload,
          user_key: USER_KEY,
          api_key: API_KEY,
          format: "json"
        })
        .reply(200);
    },
    setUpUpdateBatchNock: (prospects) => {
      const payload = JSON.stringify(prospects);
      return nock(API_PREFIX)
        .post("/prospect/version/4/do/batchUpdate")
        .query({
          prospects: payload,
          user_key: USER_KEY,
          api_key: API_KEY,
          format: "json"
        })
        .reply(200);
    }
  };
};
