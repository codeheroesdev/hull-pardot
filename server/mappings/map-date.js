/* @flow */
import moment from "moment";

export default function (date: any) {
  return moment(date).format("YYYY-MM-DDTHH:mm:ss");
}
