// Runs BullMQ's REAL custom-job-ID validation (the rule that silently broke every Paddle webhook: no ':' in IDs).
import { Job } from 'bullmq'

const fakeQueue: any = {
  name: 'contract',
  opts: {},
  toKey: () => 'k',
  keys: {},
  client: Promise.resolve({}),
  qualifiedName: 'bull:contract',
  waitUntilReady: async () => ({}),
  emit() {},
  on() {},
}

export function assertBullMqAcceptsJobId(jobId: string): void {
  const job: any = new Job(fakeQueue, 'contract', {}, { jobId })
  job.validateOptions(job.opts) // throws "Custom Id cannot contain :" exactly like Queue.add()
}
