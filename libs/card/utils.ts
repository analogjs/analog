export type AngularMemoryOutputFiles = Map<
  string,
  { contents: Uint8Array; hash: string; servable: boolean }
>;
