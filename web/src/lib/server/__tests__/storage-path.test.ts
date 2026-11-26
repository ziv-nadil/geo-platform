import { describe, expect, it } from 'vitest';
import { ownedPath } from '../storage-path';

const A = '10000000-0000-4000-b000-000000000001', B = '10000000-0000-4000-b000-000000000002';

describe('ownedPath (H3: service-role storage access stays in the row org)', () => {
  it('accepts paths under the org folder', () => {
    expect(ownedPath(A, `${A}/r1`)).toBe(`${A}/r1`);
    expect(ownedPath(A, `${A}/vid/video.mp4`)).toBe(`${A}/vid/video.mp4`);
  });
  it('rejects another org, traversal and junk', () => {
    expect(ownedPath(A, `${B}/r1`)).toBeNull();
    expect(ownedPath(A, `${A}/../${B}/r1`)).toBeNull();
    expect(ownedPath(A, `${A}/./x`)).toBeNull();
    expect(ownedPath(A, `${A}//x`)).toBeNull();
    expect(ownedPath(A, `${A}\\..\\x`)).toBeNull();
    expect(ownedPath(A, `${A}x/r1`)).toBeNull();
    expect(ownedPath(A, null)).toBeNull();
    expect(ownedPath('', '/r1')).toBeNull();
  });
});
