/* global describe, it, beforeEach, afterEach */
import axios from "axios";
import Minihull from "minihull";
import jwt from "jwt-simple";
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
    last_user_updated_at: "2016-03-29T14:00:00",
    sync_fields_to_hull: [{
      hull: "name", name: "name"
    }]
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

  const config = {
    organization: "localhost:8001",
    ship: "123456789012345678901234",
    secret: "1234"
  };
  const token = jwt.encode(config, "1234");

  it("should fetch all prospects", done => {
    const fetchProspectsNock = pardotMock.setUpFetchProspectsNock("1970-01-01T01:00:00");

    axios.get(`http://localhost:8000/fetchAll?token=${token}`).then(res => {
      if (res.data !== "ok") {
        done(Error("unexpected response", res.data));
      }

      minihull.on("incoming.request", req => {
        if (req && req.body && req.body.batch) {
          const { type, body } = req.body.batch[0];
          assert.equal(type, "traits");
          assert.equal(_.get(body, "pardot/name"), "Customer");
          assert.equal(_.get(body, "pardot/id"), "123");
          fetchProspectsNock.done();
          done();
        }
      });
    });
  });
});
