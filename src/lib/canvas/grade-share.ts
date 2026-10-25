/**
 * How much of the final course grade each assignment is worth, 0–1, the way
 * Canvas totals a grade: where the course weights its assignment groups, the
 * group's weight split across the group's points; otherwise the
 * assignment's points over the course's. Work that doesn't count toward the
 * grade (omitted from it, not graded, or worth no points) is worth nothing.
 *
 * Drop rules are left out: they shift a share only a little, and only once
 * grades are in.
 */

export interface ShareItem {
  id: string;
  groupId: string | null;
  pointsPossible: number | null;
  omitFromFinalGrade: boolean;
  gradingType: string | null;
}

export interface ShareGroup {
  id: string;
  /** % of the course grade; ignored unless the course weights its groups. */
  weight: number | null;
}

const counts = (item: ShareItem) =>
  !item.omitFromFinalGrade &&
  item.gradingType !== "not_graded" &&
  (item.pointsPossible ?? 0) > 0;

export function gradeShares(
  items: ShareItem[],
  groups: ShareGroup[],
  weighted: boolean
): Map<string, number> {
  const counted = items.filter(counts);
  const weightOf = new Map(groups.map((g) => [g.id, g.weight ?? 0]));
  const pointsIn = new Map<string | null, number>();
  for (const item of counted) {
    const key = weighted ? item.groupId : null;
    pointsIn.set(key, (pointsIn.get(key) ?? 0) + (item.pointsPossible ?? 0));
  }

  const shares = new Map<string, number>(items.map((item) => [item.id, 0]));
  for (const item of counted) {
    const points = item.pointsPossible ?? 0;
    if (weighted) {
      const total = pointsIn.get(item.groupId) ?? 0;
      const weight = item.groupId ? (weightOf.get(item.groupId) ?? 0) : 0;
      shares.set(item.id, total > 0 ? (weight / 100) * (points / total) : 0);
    } else {
      const total = pointsIn.get(null) ?? 0;
      shares.set(item.id, total > 0 ? points / total : 0);
    }
  }
  return shares;
}
