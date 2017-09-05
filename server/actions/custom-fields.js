/* @flow */
import { Request, Response } from "express";

export default function getCustomFields(direction: string) {
  return (req: Request, res: Response) => {
    return req.hull.service.syncAgent.getCustomFields(direction).then(options => {
      return res.send({ options });
    });
  };
}
