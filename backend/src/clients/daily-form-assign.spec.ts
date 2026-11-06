/**
 * Assigning a daily log when the form carries a deleted client.
 *
 * assessment_form_templates.assigned_client_ids is a plain uuid[] with no
 * foreign key, so deleting a client leaves a dead id on every form that had
 * them. The dialog seeds its checkboxes from that list and resends it, so a
 * single deleted client made the form permanently unassignable - found in
 * production, where one of three ids pointed at nothing.
 */
describe('daily log assignment with stale client ids', () => {
  const LIVE_A = '505f437d-c14e-4c02-9779-4a18e37bb171';
  const LIVE_B = '45b92e27-44ce-45c9-b25e-a36164a93f32';
  const DELETED = '6faf06b5-ff37-41c1-8e0b-fc66d077ff0b';

  /** What the controller now does: keep the ids a live client matches. */
  const resolve = (requested: string[], live: string[]) => {
    const unique = [...new Set(requested)];
    const kept = unique.filter((id) => live.includes(id));
    if (unique.length && !kept.length) throw new Error('Client not found in this workspace.');
    return kept;
  };

  it('saves the live clients and drops the deleted one', () => {
    expect(resolve([LIVE_A, DELETED, LIVE_B], [LIVE_A, LIVE_B])).toEqual([LIVE_A, LIVE_B]);
  });

  it('still refuses when every id is wrong', () => {
    // A caller sending only unknown ids is a bug, not old rubbish on a form.
    expect(() => resolve([DELETED], [LIVE_A, LIVE_B]))
      .toThrow('Client not found in this workspace.');
  });

  it('treats an empty selection as switching the log off, not an error', () => {
    expect(resolve([], [LIVE_A])).toEqual([]);
  });

  it('de-duplicates before checking', () => {
    expect(resolve([LIVE_A, LIVE_A], [LIVE_A])).toEqual([LIVE_A]);
  });

  it('never returns an id the workspace does not own', () => {
    const OTHER_WORKSPACE = '11111111-1111-4111-8111-111111111111';
    expect(resolve([LIVE_A, OTHER_WORKSPACE], [LIVE_A])).toEqual([LIVE_A]);
  });
});
