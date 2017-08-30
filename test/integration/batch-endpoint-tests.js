/* global describe, it, beforeEach, afterEach */

import Minihull from "minihull";
import assert from "assert";
import _ from "lodash";

import bootstrap from "./support/bootstrap";
import PardotMock from "./support/pardot-mock";

describe("Connector for batch endpoint", function test() {
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
    minihull.stubConnector({ id: "123456789012345678901234", private_settings });
    minihull.stubSegments([{
      name: "testSegment",
      id: "hullSegmentId"
    }]);

    setTimeout(() => {
      done();
    }, 1000);
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  it("should send users to pardot", done => {
    const upsertBatchNock = pardotMock.setUpUpsertBatchNock([{
      email: "222@test.com",
      test: "test2",
      firstName: "James"
    }, {
      email: "444@test.com",
      test: "test4",
      firstName: "John"
    }]);

    minihull.stubBatch([{
      email: "222@test.com", test: "test2", first_name: "James", last_name: "Veitch", segment_ids: ["hullSegmentId"]
    }, {
      email: "444@test.com", test: "test4", first_name: "John", field: "test_field", segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      minihull.on("incoming.request", req => {
        upsertBatchNock.done();
        const jamesVeitchBatch = req.body.batch[0];
        const johnSnowBatch = req.body.batch[1];

        assert.equal(jamesVeitchBatch.type, "traits");
        assert.equal(_.get(jamesVeitchBatch.body, "pardot/firstName"), "James");
        assert.equal(_.get(jamesVeitchBatch.body, "pardot/test"), "test2");
        assert.equal(_.get(jamesVeitchBatch.body, "pardot/email"), "222@test.com");
        assert(_.get(jamesVeitchBatch.body, "pardot/updated_at"));
        assert.equal(Object.keys(jamesVeitchBatch.body).length, 4);

        assert.equal(johnSnowBatch.type, "traits");
        assert.equal(_.get(johnSnowBatch.body, "pardot/firstName"), "John");
        assert.equal(_.get(johnSnowBatch.body, "pardot/test"), "test4");
        assert.equal(_.get(johnSnowBatch.body, "pardot/email"), "444@test.com");
        assert(_.get(johnSnowBatch.body, "pardot/updated_at"));
        assert.equal(Object.keys(johnSnowBatch.body).length, 4);
        done();
      });
    });
  });

  it("should send only those users who have email", done => {
    const upsertBatchNock = pardotMock.setUpUpsertBatchNock([{
      email: "222@test.com",
      test: "test2",
      firstName: "James"
    }]);

    minihull.stubBatch([{
      email: "222@test.com", test: "test2", first_name: "James", last_name: "Veitch", segment_ids: ["hullSegmentId"]
    }, {
      test: "test4", first_name: "John", field: "test_field", segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      minihull.on("incoming.request", req => {
        upsertBatchNock.done();
        const { type, body } = req.body.batch[0];

        assert.equal(type, "traits");
        assert.equal(_.get(body, "pardot/firstName"), "James");
        assert.equal(_.get(body, "pardot/test"), "test2");
        assert.equal(_.get(body, "pardot/email"), "222@test.com");
        assert(_.get(body, "pardot/updated_at"));
        assert.equal(Object.keys(body).length, 4);

        done();
      });
    });
  });

  it("should send users with pardot id", done => {
    pardotMock.setUpUpdateBatchNock({
      prospects: [
        {
          test: "test2",
          firstName: "James",
          id: 222
        },
        {
          test: "test4",
          firstName: "John",
          id: 444
        }
      ]
    }, () => done());

    minihull.stubBatch([{
      "traits_pardot/id": 222, test: "test2", first_name: "James", last_name: "Veitch", segment_ids: ["hullSegmentId"]
    }, {
      "traits_pardot/id": 444, test: "test4", first_name: "John", field: "test_field", segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch");
  });

  it("should send user traits if he has both pardot id and email", done => {
    const updateBatchNock = pardotMock.setUpUpdateBatchNock({
      prospects: [
        {
          email: "222@test.com",
          test: "test2",
          firstName: "James",
          id: 222
        },
        {
          email: "444@test.com",
          test: "test4",
          firstName: "John",
          id: 444
        }
      ]
    });

    minihull.stubBatch([{
      "traits_pardot/id": 222, email: "222@test.com", test: "test2", first_name: "James", last_name: "Veitch", segment_ids: ["hullSegmentId"]
    }, {
      "traits_pardot/id": 444, email: "444@test.com", test: "test4", first_name: "John", field: "test_field", segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      minihull.on("incoming.request", req => {
        updateBatchNock.done();

        const jamesVeitchBatch = req.body.batch[0];
        const johnSnowBatch = req.body.batch[1];

        assert.equal(jamesVeitchBatch.type, "traits");
        assert.equal(_.get(jamesVeitchBatch.body, "pardot/firstName"), "James");
        assert.equal(_.get(jamesVeitchBatch.body, "pardot/test"), "test2");
        assert.equal(_.get(jamesVeitchBatch.body, "pardot/email"), "222@test.com");
        assert(_.get(jamesVeitchBatch.body, "pardot/updated_at"));
        assert.equal(Object.keys(jamesVeitchBatch.body).length, 4);

        assert.equal(johnSnowBatch.type, "traits");
        assert.equal(_.get(johnSnowBatch.body, "pardot/firstName"), "John");
        assert.equal(_.get(johnSnowBatch.body, "pardot/test"), "test4");
        assert.equal(_.get(johnSnowBatch.body, "pardot/email"), "444@test.com");
        assert(_.get(johnSnowBatch.body, "pardot/updated_at"));
        assert.equal(Object.keys(johnSnowBatch.body).length, 4);

        done();
      });
    });
  });
});
