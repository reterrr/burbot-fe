import { expect, test } from '@playwright/test'

const fixture = JSON.parse(process.env.BURBOT_SELECTOR_REVIEW_CASE || 'null')

test('Studio displays Firefox monitoring observations and failed candidates from the live API', async ({
  page,
}) => {
  test.skip(!fixture, 'Run the cross-repository monitoring test from the backend checkout.')
  const { failedTaskId, changedTaskId, snapshotId, canonical, previous, current, rawCandidate } =
    fixture

  await page.goto('/#/tasks/' + failedTaskId + '/review')
  const comparison = page.getByTestId('evidence-comparison')
  const previousEvidence = comparison.getByRole('region', { name: 'Previous evidence' })
  const currentEvidence = comparison.getByRole('region', { name: 'Current evidence' })
  const candidates = comparison.getByRole('region', { name: 'Observed candidates' })
  await expect(comparison.getByText(canonical, { exact: true })).toBeVisible()
  await expect(previousEvidence.getByText(previous, { exact: true })).toBeVisible()
  await expect(currentEvidence.getByText('No validated observation')).toBeVisible()
  await expect(currentEvidence.getByText(current, { exact: true })).toHaveCount(0)
  await expect(candidates.getByText('Unverified', { exact: true })).toBeVisible()
  await expect(candidates.getByText('div.info-top p.wp-block-paragraph')).toBeVisible()
  await expect(candidates.getByText('Snapshot #' + snapshotId)).toBeVisible()
  await expect(candidates.getByText('The selection quote no longer matches.').first()).toBeVisible()
  expect(await candidates.getByText(current, { exact: true }).first().textContent()).toBe(rawCandidate)
  await expect(page.getByRole('button', { name: 'Open snapshot #' + snapshotId })).toBeVisible()

  await page.goto('/#/tasks/' + changedTaskId + '/review')
  await expect(comparison.getByText('Changed evidence', { exact: true })).toBeVisible()
  await expect(comparison.getByText(canonical, { exact: true })).toBeVisible()
  await expect(previousEvidence.getByText(previous, { exact: true })).toBeVisible()
  await expect(currentEvidence.getByText(current, { exact: true })).toBeVisible()
  await expect(candidates).toHaveCount(0)
})
