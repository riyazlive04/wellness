/**
 * Daily blood pressure — the client's own monitor readings.
 *
 * Shares every part of its behaviour with the blood sugar screen: the entry
 * card, the clinical bands, the spike rings, the weekly and monthly views.
 * Only the markers and the wording differ, so this is a wrapper rather than a
 * second copy of that screen.
 *
 * It is a SEPARATE screen rather than another section on the sugar one
 * because mmHg and mg/dL cannot share a chart axis: a diastolic of 80 would
 * be drawn level with a hypoglycaemic glucose reading.
 */
import { BP_MARKERS } from '@/lib/sugar-bands';

import { ReadingsScreen } from './blood-sugar';

export default function BloodPressure() {
  return (
    <ReadingsScreen
      markers={BP_MARKERS}
      title="Today's blood pressure"
      hint="Enter both numbers from your monitor."
      trendTitle="Blood pressure"
      emptyHint="No readings yet. Save today&apos;s numbers above and your coloured trend starts here."
    />
  );
}
