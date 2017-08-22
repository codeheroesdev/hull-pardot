/* @flow */
import { Request, Response } from "express";

export default function getCustomFields(req: Request, res: Response) {
  req.hull.service.syncAgent.getCustomFields().then(options => {
    return res.send({ options });
  });
}
