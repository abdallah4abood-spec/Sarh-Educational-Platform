/**
 * Non-Prisma helpers imported by the fixtures; scanned as a fixture too.
 * `run` stands in for "some other function receives this value".
 */
export const metrics = {
  count: (): number => 0,
};

/** An ordinary repository object: same method names, no Prisma provenance. */
export const repository = {
  count: (): number => 0,
  findFirst: (_args?: unknown): null => null,
};

export const run = (value: unknown): unknown => value;
