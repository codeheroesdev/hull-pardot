/* global describe, it, beforeEach, afterEach */
import sinon from "sinon";
import assert from "assert";
import mapDate from "../../server/mappings/map-date";

import PardotClient from "./support/pardot-mock";
import SyncAgent from "../../server/lib/sync-agent";

describe("Sync Agent", () => {
  const pardotClient = PardotClient("api-key-321", "user-key-123");
  const ctx = {
    ship: {
      private_settings: {
        user_key: "user-key-123",
        email: "test@email.com",
        password: "jsisthebest",
        api_key: "api-key-321",
        last_user_updated_at: "2016-03-29T14:00:00",
        sync_fields_to_pardot: [{
          hull: "test", name: "test"
        }, {
          hull: "first_name", name: "firstName"
        }],
        sync_fields_to_hull: [{
          hull: "test", name: "test"
        }]
      }
    },
    client: {
      asUser: () => ctx.client,
      logger: {
        info: (data, args = "") => console.log(data, args),
        debug: (data, args = "") => console.log(data, args),
        error: (data, args = "") => console.log(data, args)
      },
      traits: sinon.spy(() => Promise.resolve({}))
    },
    metric: {
      increment: () => {}
    },
    helpers: {
      updateSettings: sinon.spy(() => {})
    },
  };

  it("should authenticate user", (done) => {
    const context = {
      ship: {
        private_settings: {
          user_key: "user-key-123",
          email: "test@email.com",
          password: "jsisthebest"
        }
      },
      client: {
        asUser: () => ctx.client,
        logger: {
          info: (data) => console.log(data),
          debug: (data) => console.log(data),
          error: (data) => console.log(data)
        },
        traits: sinon.spy(() => {
        })
      },
      helpers: {
        updateSettings: sinon.spy(() => {})
      },
      metric: {
        increment: () => {}
      }
    };
    const syncAgent = new SyncAgent(context);
    const authenticationNock = pardotClient.setUpAuthenticationNock("test@email.com", "jsisthebest", "user-key-123");

    syncAgent.authenticate("test@email.com", "password").then(() => {
      authenticationNock.done();
      assert.equal(context.helpers.updateSettings.firstCall.args[0].api_key, "api-key-321");
      done();
    });
  });

  it("should return custom fields", (done) => {
    const syncAgent = new SyncAgent(ctx);
    const customFieldsNock = pardotClient.setUpCustomFieldsNock(mapDate(0));

    syncAgent.getCustomFields().then(res => {
      customFieldsNock.done();
      assert.equal(res.length, 31);
      assert.equal(res[0].label, "Some Custom Field");
      assert.equal(res[0].value, "custom_Field");
      done();
    });
  });

  it("should return prospects", (done) => {
    const syncAgent = new SyncAgent(ctx);
    const prospectsNock = pardotClient.setUpFetchProspectsNock("2016-03-29T14:00:00");

    syncAgent.fetchProspects().then(prospects => {
      prospectsNock.done();
      assert.equal(prospects[0].id, 123);
      done();
    });
  });

  it("should send two batches with already sent users and rest of them", (done) => {
    const syncAgent = new SyncAgent(ctx);
    const firstUser = {
      email: "test@email.com",
      test: [{ test: "array test" }]
    };
    const secondUser = {
      test: [{ test: "array test" }],
      "traits_pardot/id": "321",
      first_name: "Michael"
    };
    const upsertBatchNock = pardotClient.setUpUpsertBatchNock([firstUser]);
    const updateBatchNock = pardotClient.setUpUpdateBatchNock({ 321: { test: [{ test: "array test" }], firstName: "Michael" } });

    syncAgent.sendUsersBatch([firstUser, secondUser]).then(() => {
      upsertBatchNock.done();
      updateBatchNock.done();
      done();
    });
  });
});
