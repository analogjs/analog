import { ApplicationExecutorSchema } from './schema';
import executor from './executor';

const options: ApplicationExecutorSchema = {};

describe('Application Executor', () => {
  it('can run', async () => {
    const output = await executor(options);
    expect(output.success).toBe(true);
  });
});
