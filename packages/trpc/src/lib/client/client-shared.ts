import { AnyRouter } from "@trpc/server";
import { CreateTRPCClientOptions } from "@trpc/client/src/createTRPCUntypedClient";

export type TrpcOptions<T extends AnyRouter> = {
  url: string;
  options: Partial<CreateTRPCClientOptions<T>>;
};
