import { CatchAllProjectField } from '@/components/settings/CatchAllProjectField';
import { CycleField } from '@/components/settings/CycleField';
import { ReminderTimeField } from '@/components/settings/ReminderTimeField';
import { SectionRule } from '@/components/settings/SettingsPrimitives';
import { TargetHoursField } from '@/components/settings/TargetHoursField';

/**
 * Logging defaults (Story 7.10, AC3, Block 3 of 5) — the ONLY region on the
 * page where anything can be typed. One padded card (`round2:272`), the
 * five controls in the design's order and widths.
 */

const STRINGS = {
  heading: 'Logging defaults',
};

export type LoggingDefaultsBlockProps = {
  onSaved?: (() => void) | undefined;
};

export function LoggingDefaultsBlock({ onSaved }: LoggingDefaultsBlockProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <SectionRule heading={STRINGS.heading} />
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-hairline">
        <CatchAllProjectField onSaved={onSaved} />

        <div aria-hidden="true" className="h-px bg-border-hairline" />

        <div className="grid grid-cols-2 gap-4">
          <TargetHoursField onSaved={onSaved} />
          <ReminderTimeField onSaved={onSaved} />
        </div>

        <CycleField onSaved={onSaved} />
      </div>
    </div>
  );
}
