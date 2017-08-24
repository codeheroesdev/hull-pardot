/* @flow */
import { Request, Response } from "express";

export default function getCustomFields(req: Request, res: Response) {
  return req.hull.service.syncAgent.getCustomFields().then(options => {
    return res.send({ options });
  });
}
