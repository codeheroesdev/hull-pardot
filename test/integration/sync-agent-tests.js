/* global describe, it, beforeEach, afterEach */
import sinon from "sinon";
import Bottleneck from "bottleneck";
import assert from "assert";

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
        sync_fields_to_pardot: [{
          hull: "test", name: "test"
        }, {
          hull: "first_name", name: "firstName"
        }],
        sync_fields_to_hull: [{
          hull: "test", name: "test"
        }]
      }
    }
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
      helpers: {
        updateSettings: sinon.spy(() => {})
      }
    };
    const syncAgent = new SyncAgent(context, new Bottleneck(30, 30));
    const authenticationNock = pardotClient.setUpAuthenticationNock("test@email.com", "jsisthebest", "user-key-123");

    syncAgent.authenticate("test@email.com", "password").then(() => {
      authenticationNock.done();
      assert.equal(context.helpers.updateSettings.firstCall.args[0].api_key, "api-key-321");
      done();
    });
  });

  it("should create prospect", (done) => {
    const syncAgent = new SyncAgent(ctx, new Bottleneck(30, 30));
    const prospectNock = pardotClient.setUpUpsertProspectNock("test@email.com", { test: [{ test: "array test" }] });

    syncAgent.upsertProspect({ email: "test@email.com", test: [{ test: "array test" }] }).then(res => {
      prospectNock.done();
      assert.equal(res.prospect.id, "123");
      assert.equal(res.prospect.email, "test@email.com");
      done();
    });
  });

  it("should return custom fields", (done) => {
    const syncAgent = new SyncAgent(ctx, new Bottleneck(30, 30));
    const customFieldsNock = pardotClient.setUpCustomFieldsNock();

    syncAgent.getCustomFields().then(res => {
      customFieldsNock.done();
      assert(res.length, 1);
      assert.equal(res[0].label, "Some Custom Field");
      assert.equal(res[0].value, "Some Custom Field");
      done();
    });
  });

  it("should return prospects", (done) => {
    const syncAgent = new SyncAgent(ctx, new Bottleneck(30, 30));
    const prospectsNock = pardotClient.setUpFetchProspectsNock();

    syncAgent.fetchProspects().then(prospects => {
      prospectsNock.done();
      assert.equal(prospects[0].id, 123);
      assert.equal(prospects[0].id, 123);
      done();
    });
  });

  it("should send two batches with already sent users and rest of them", (done) => {
    const syncAgent = new SyncAgent(ctx, new Bottleneck(30, 30));
    const firstUser = {
      email: "test@email.com",
      test: [{ test: "array test" }]
    };
    const secondUser = {
      first_name: "Michael",
      "traits_pardot/id": "321",
      test: [{ test: "array test" }]
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
