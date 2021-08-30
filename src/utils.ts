export function takeWithRepeats<T>(things:T[], count: number) {
  const result = [];
  for(let i = 0; i < count; i++) {
    result.push(things[i % things.length])
  }
  return result;
}