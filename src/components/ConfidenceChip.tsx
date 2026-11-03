import { useI18n } from '../i18n/useI18n';
import { confidenceLevel } from '../lib/confidence';

/** Neutral by default; only takes colour (amber, then red) when confidence drops. */
export function ConfidenceChip({ confidence }: { confidence: number }) {
  const { t } = useI18n();
  const level = confidenceLevel(confidence);
  const pct = Math.round(confidence * 100);
  return (
    <span className={`chip chip--${level}`} title={t.result.confidenceHint}>
      {t.result.confidence(pct)}
    </span>
  );
}
