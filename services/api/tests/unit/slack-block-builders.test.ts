import {
  buildCommitmentMissedBlocks,
  buildManagerAlertBlocks,
  buildDeadlineReminderBlocks,
  buildCommitmentFulfilledBlocks,
} from '../../src/modules/notifications/slack-notify.service'

describe('Slack Block Kit Builder Pure Functions', () => {
  describe('buildCommitmentMissedBlocks', () => {
    it('produces valid Block Kit JSON structure for an overdue commitment', () => {
      const input = {
        id: 'comm-101',
        text: 'Deploy production hotfix for auth service',
        dueDateRaw: 'by Thursday 5 PM',
        actionUrl: 'http://localhost:3000/commitments/comm-101',
      }

      const blocks = buildCommitmentMissedBlocks(input)

      expect(Array.isArray(blocks)).toBe(true)
      expect(blocks.length).toBeGreaterThanOrEqual(3)

      const header = blocks.find((b) => b.type === 'header') as any
      expect(header).toBeDefined()
      expect(header.text.text).toContain('Missed Commitment')

      const section = blocks.find((b) => b.type === 'section') as any
      expect(section).toBeDefined()
      expect(section.text.text).toContain('Deploy production hotfix for auth service')
      expect(section.text.text).toContain('by Thursday 5 PM')

      const actions = blocks.find((b) => b.type === 'actions') as any
      expect(actions).toBeDefined()
      expect(actions.elements[0].url).toBe('http://localhost:3000/commitments/comm-101')
    })

    it('gracefully handles missing dueDateRaw / null dueDate', () => {
      const input = {
        id: 'comm-102',
        text: 'Review pull request',
        dueDateRaw: null,
        dueDate: null,
        actionUrl: 'http://localhost:3000/commitments/comm-102',
      }

      const blocks = buildCommitmentMissedBlocks(input)
      expect(blocks).toBeDefined()
      const section = blocks.find((b) => b.type === 'section') as any
      expect(section.text.text).toContain('Review pull request')
      expect(section.text.text).not.toContain('_Due:')
    })
  })

  describe('buildManagerAlertBlocks', () => {
    it('produces manager-framed alert payload with commitment score', () => {
      const input = {
        id: 'comm-201',
        text: 'Finish Q3 architecture roadmap',
        ownerName: 'Alice Smith',
        commitmentScore: 85,
        profileUrl: 'http://localhost:3000/team/members/user-alice',
      }

      const blocks = buildManagerAlertBlocks(input)

      const header = blocks.find((b) => b.type === 'header') as any
      expect(header.text.text).toContain('Manager Alert')

      const section = blocks.find((b) => b.type === 'section') as any
      expect(section.text.text).toContain('Alice Smith')
      expect(section.text.text).toContain('Finish Q3 architecture roadmap')
      expect(section.text.text).toContain('85%')

      const actions = blocks.find((b) => b.type === 'actions') as any
      expect(actions.elements[0].url).toBe('http://localhost:3000/team/members/user-alice')
    })

    it('handles missing commitment score gracefully', () => {
      const input = {
        id: 'comm-202',
        text: 'Update security policies',
        ownerName: 'Bob Jones',
        commitmentScore: null,
        profileUrl: 'http://localhost:3000/team/members/user-bob',
      }

      const blocks = buildManagerAlertBlocks(input)
      const section = blocks.find((b) => b.type === 'section') as any
      expect(section.text.text).toContain('Bob Jones')
      expect(section.text.text).not.toContain('Current Commitment Score:')
    })
  })

  describe('buildDeadlineReminderBlocks', () => {
    it('produces deadline reminder Block Kit structure', () => {
      const input = {
        id: 'comm-301',
        text: 'Submit security audit findings',
        dueDateRaw: 'Tomorrow at 10 AM',
        actionUrl: 'http://localhost:3000/commitments/comm-301',
      }

      const blocks = buildDeadlineReminderBlocks(input)

      const header = blocks.find((b) => b.type === 'header') as any
      expect(header.text.text).toContain('Deadline Reminder')

      const section = blocks.find((b) => b.type === 'section') as any
      expect(section.text.text).toContain('Submit security audit findings')
      expect(section.text.text).toContain('Tomorrow at 10 AM')
    })
  })

  describe('buildCommitmentFulfilledBlocks', () => {
    it('produces celebratory visual blocks with checkmark and positive tone', () => {
      const input = {
        id: 'comm-401',
        text: 'Migrate database to PostgreSQL 16',
        ownerName: 'Charlie Brown',
        actionUrl: 'http://localhost:3000/commitments/comm-401',
      }

      const blocks = buildCommitmentFulfilledBlocks(input)

      const header = blocks.find((b) => b.type === 'header') as any
      expect(header.text.text).toContain('Commitment Fulfilled!')

      const section = blocks.find((b) => b.type === 'section') as any
      expect(section.text.text).toContain('Nice work!')
      expect(section.text.text).toContain('Charlie Brown')
      expect(section.text.text).toContain('Migrate database to PostgreSQL 16')
    })
  })
})
