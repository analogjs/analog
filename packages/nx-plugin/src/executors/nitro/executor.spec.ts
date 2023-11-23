import { NitroExecutorSchema } from './schema';
import executor from './executor';

const options: NitroExecutorSchema = {};

describe('Nitro Executor', () => {
  it('can run', async () => {
    const output = await executor(options);
    expect(output.success).toBe(true);
  });
});
