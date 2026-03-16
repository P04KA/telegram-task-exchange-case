export const numericTransformer = {
  to(value: number) {
    return value;
  },
  from(value: string | number | null): number {
    if (value === null) {
      return 0;
    }

    return Number(value);
  },
};
