/* global describe, it, beforeEach, afterEach */
import Minihull from "minihull";
import assert from "assert";
import _ from "lodash";

import bootstrap from "./support/bootstrap";
import PardotMock from "./support/pardot-mock";

describe("Connector for notify endpoint", function test() {
  let minihull;
  let server;
  const pardotMock = new PardotMock("api-key-321", "user-key-123");

  const private_settings = {
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
    }],
    synchronized_segments: ["hullSegmentId"]
  };

  beforeEach(done => {
    minihull = new Minihull();
    server = bootstrap();
    minihull.listen(8001);

    setTimeout(() => {
      done();
    }, 1000);
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  it("should send user to pardot", done => {
    const upsertUserNock = pardotMock.setUpUpsertBatchNock([{
      email: "test@email.com",
      test: "test",
      firstName: "Shrek"
    }]);

    minihull.smartNotifyConnector({ id: "123456789012345678901236", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: { email: "test@email.com", test: "test", first_name: "Shrek", last_name: "Ogre" },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]).then(() => {
      minihull.on("incoming.request", req => {
        upsertUserNock.done();
        const { type, body } = req.body.batch[0];

        assert.equal(type, "traits");
        assert.equal(_.get(body, "pardot/test"), "test");
        assert.equal(_.get(body, "pardot/firstName"), "Shrek");
        assert.equal(_.get(body, "pardot/email"), "test@email.com");
        assert(_.get(body, "pardot/updated_at"));
        assert.equal(Object.keys(body).length, 4);

        done();
      });
    }).catch(err => console.log(err));
  });

  it("should not send user to pardot if he does not belong to filtered segments", done => {
    const upsertUserNock = pardotMock.setUpUpsertBatchNock([{
      email: "test@email.com",
      firstName: "Shrek"
    }]);

    minihull.smartNotifyConnector({ id: "123456789012345678901236", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: { email: "test@email.com", first_name: "Shrek" },
      changes: {},
      events: [],
      segments: []
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]).then(() => {
      minihull.on("incoming.request", req => {
        done(Error("Unwanted request !", req.body));
      });
    });

    setTimeout(() => {
      assert(!upsertUserNock.isDone());
      done();
    }, 1500);
  });
});
