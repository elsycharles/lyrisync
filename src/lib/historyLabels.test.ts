import { describe, expect, it } from 'vitest';
import { describeChange } from './historyLabels';
import type { LyricLine } from './types';

const l = (id: string, text: string, time: number | null): LyricLine => ({ id, text, time, source: 'auto' });
const base = [l('a', 'One', 1), l('b', 'Two', 2), l('c', 'Three', 3)];

describe('describeChange', () => {
  it('names the one line that changed', () => {
    expect(describeChange(base, [base[0]!, { ...base[1]!, time: 2.5 }, base[2]!])).toEqual({
      kind: 'edit',
      retimed: 1,
      retexted: 0,
      added: 0,
      removed: 0,
      line: 2,
    });
    expect(describeChange(base, [base[0]!, base[2]!])).toMatchObject({ removed: 1, line: 2 });
    const added = [base[0]!, l('n', 'New', null), base[1]!, base[2]!];
    expect(describeChange(base, added)).toMatchObject({ added: 1, line: 2 });
    // A line both retimed and retexted is still one line.
    expect(describeChange(base, [{ ...base[0]!, time: 0.5, text: 'Uno' }, base[1]!, base[2]!])).toMatchObject({
      retimed: 1,
      retexted: 1,
      line: 1,
    });
  });

  it('counts several changes without a line number', () => {
    const shifted = base.map((x) => ({ ...x, time: x.time! + 1 }));
    expect(describeChange(base, shifted)).toEqual({ kind: 'edit', retimed: 3, retexted: 0, added: 0, removed: 0 });
  });
});
