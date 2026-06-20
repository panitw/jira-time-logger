const STRINGS = {
  heading: 'Reporting line',
  loading: 'Loading from Jira…',
  managerLabel: 'Manager (read from Jira):',
  skipLevelLabel: 'Skip-level (read from Jira):',
  managerNotSet: 'Manager not set in Jira — please contact your admin to configure it for richer pre-fill suggestions.',
  skipLevelNotSet: 'Not set in Jira.',
  error: 'Could not load reporting line.',
};

export type ManagerNames = {
  managerDisplayName: string | null;
  skipLevelDisplayName: string | null;
};

type Props = {
  managerDisplayName: string | null;
  skipLevelDisplayName: string | null;
  loading: boolean;
  error: boolean;
};

export function ManagerDisplay({
  managerDisplayName,
  skipLevelDisplayName,
  loading,
  error,
}: Props): React.ReactElement {
  if (loading) {
    return (
      <section className="mt-8">
        <h3 className="text-base font-semibold text-neutral-900">{STRINGS.heading}</h3>
        <p className="mt-2 text-sm text-neutral-500">{STRINGS.loading}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8">
        <h3 className="text-base font-semibold text-neutral-900">{STRINGS.heading}</h3>
        <p className="mt-2 text-sm text-state-danger">{STRINGS.error}</p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h3 className="text-base font-semibold text-neutral-900">{STRINGS.heading}</h3>
      <hr className="my-3 border-neutral-200" />
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-neutral-500">{STRINGS.managerLabel} </span>
          {managerDisplayName ? (
            <span className="font-mono text-neutral-900">{managerDisplayName}</span>
          ) : (
            <span className="text-neutral-500">{STRINGS.managerNotSet}</span>
          )}
        </div>
        <div>
          <span className="text-neutral-500">{STRINGS.skipLevelLabel} </span>
          {skipLevelDisplayName ? (
            <span className="font-mono text-neutral-900">{skipLevelDisplayName}</span>
          ) : (
            <span className="text-neutral-500">
              {managerDisplayName ? STRINGS.skipLevelNotSet : STRINGS.managerNotSet}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}