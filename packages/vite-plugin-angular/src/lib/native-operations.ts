/** Admit native callers before shutdown, then let their results settle before disposing a runtime. */
export class NativeOperations {
  private readonly pending = new Set<Promise<unknown>>();

  track<A>(operation: Promise<A>): Promise<A> {
    this.pending.add(operation);
    void operation.then(
      () => {
        this.pending.delete(operation);
      },
      () => {
        this.pending.delete(operation);
      },
    );
    return operation;
  }

  async drain(): Promise<void> {
    await Promise.all(
      [...this.pending].map((operation) => operation.catch(() => {})),
    );
  }
}
