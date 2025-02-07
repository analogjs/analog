import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../trpc';
import { Note } from '../../../note';

let noteId = 0;
const notes: Note[] = [];
export const noteRouter = router({
  create: publicProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) =>
      notes.push({
        id: noteId++,
        note: input.title,
        createdAt: new Date(),
      }),
    ),
  list: publicProcedure.query(() => notes),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(({ input }) => {
      const index = notes.findIndex((note) => input.id === note.id);
      notes.splice(index, 1);
    }),
});
