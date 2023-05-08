type Note = {
  note: string;
};

export const notes: Record<'first', Note> = {
  first: {
    note: 'I am the first note',
  },
} as const;
