// `.tsrx` modules are compiled by @analogjs/vite-plugin-tsrx. TypeScript can't
// read them, so their exports are typed `any` when imported from `.ts` files.
declare module '*.tsrx';
