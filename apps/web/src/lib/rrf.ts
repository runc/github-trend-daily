/** Reciprocal Rank Fusion over multiple ranked id lists. */
export function reciprocalRankFusion(
  rankLists: string[][],
  k = 60,
): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of rankLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
