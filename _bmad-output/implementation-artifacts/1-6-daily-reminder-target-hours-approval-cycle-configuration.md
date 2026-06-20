# Story 1.6: Daily Reminder, Target Hours & Approval Cycle Configuration

Status: ready-for-dev
baseline_commit: HEAD

## Story

As a connected worker, I want to configure my daily reminder time, work-day target hours, and approval cycle, so the extension's cadence matches my team's rhythm.

## Acceptance Criteria

1. Three fields: "Daily reminder time" (time input, default 17:00), "Work-day target (hours)" (number input, default 8), "Approval cycle" (dropdown, default "Calendar month").
2. On blur, values saved to settings. No "Save" button — change applied immediately (UX-DR29).
3. Daily reminder alarm registered via `chrome.alarms.create('daily-reminder', { when, periodInMinutes: 1440 })`. Notification trigger deferred to Epic 3 — this story only creates the alarm.
4. Out-of-range validation: target hours < 1 or > 24 shows `state.danger` border. Prior valid value retained until valid input.
5. Approval cycle dropdown locked to single option "Calendar month" for v1.0.

## Dev Notes

- Build three components: `ReminderTimeField.tsx`, `TargetHoursField.tsx`, `CycleField.tsx`.
- Extend `lib/storage/settings.ts`: `reminderTime`, `targetHours`, `approvalCycle`.
- Wire alarm in `entrypoints/background.ts` (registers when settings loaded).
