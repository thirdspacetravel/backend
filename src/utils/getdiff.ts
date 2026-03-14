export const getDifference = <T>(first: T[], second: T[]): T[] => {
  const secondSet = new Set(second);
  return first.filter(item => !secondSet.has(item));
};
