/**
 * AC8's disconnected-state placeholder behind the connect card — Story
 * 7.10, E-2. `round2:405-409`.
 *
 * AC8 warns explicitly: "the dimmed controls are verified to still meet
 * WCAG AA contrast — halving the opacity of a compliant control usually
 * does not." Hand-computed at `opacity:.5` over white (the design source's
 * literal value): `#1E1B2E` (a field label) composites to `#8E8D96` — 3.28:1,
 * FAILS AA. `#6B6678` (the heading) composites to `#B5B2BE` — 2.08:1, FAILS
 * AA. Both confirm the AC's own prediction.
 *
 * Resolution: render the design's OWN "not connected" mini-mockup literally
 * (`round2:405-409`) — a non-interactive SILHOUETTE, shapes only, no dimmed
 * text at all. The heading renders at FULL contrast (`text-muted`, 5.30:1 on
 * this surface's actual `bg-background` #FAFAFB — N-4 correction: this
 * comment previously cited 5.53:1, `text-muted`'s figure on pure white —
 * no opacity applied to it), and the two field placeholders are empty
 * bordered boxes carrying no text. Once nothing dimmed carries text, the
 * AA question dissolves rather than needing a weaker fix (the alternative —
 * real `disabled` controls under WCAG 1.4.3's inactive-component exemption —
 * is strictly weaker: the AC asks for verification, not an exemption).
 *
 * `aria-hidden` + `inert`: this is decorative scenery behind the connect
 * card, not content — nothing here is announced or focusable. Finding 17:
 * `inert=""` is a STRING, and React 19 types (and treats) `inert` as a
 * boolean attribute — an empty string reads as `false` and React drops the
 * attribute entirely (confirmed via `renderToStaticMarkup`, which also logs
 * a console warning). `inert={true}` is what actually prevents interaction.
 */

const STRINGS = {
  heading: 'Logging defaults',
};

export function LoggingDefaultsSilhouette(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      inert={true}
      className="flex w-full max-w-[420px] flex-col gap-[9px]"
    >
      <span className="font-chrome text-[13px] font-semibold text-muted">{STRINGS.heading}</span>
      <div className="h-[34px] rounded-md border border-border bg-surface" />
      <div className="h-[34px] rounded-md border border-border bg-surface" />
    </div>
  );
}
