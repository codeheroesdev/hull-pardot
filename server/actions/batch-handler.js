/* @flow */

export default function batchHandler({ service: { syncAgent } }: Object, messages: Array<Object> = []) {
  return syncAgent.sendUsersBatch(messages.map(m => m.user));
}
