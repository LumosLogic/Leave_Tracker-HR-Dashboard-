import { useEffect, useRef } from 'react';
import 'driver.js/dist/driver.css';

// Starts a Driver.js tour the first time this hook is mounted for a given key.
// Steps whose target elements are missing or have no visible height are skipped,
// so the tour degrades gracefully when features/sections are disabled.
export function useTour(steps, tourKey) {
  const driverRef = useRef(null);

  useEffect(() => {
    if (!steps?.length || !tourKey) return;
    if (localStorage.getItem(tourKey)) return; // Already seen

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const { driver } = await import('driver.js');

        // Filter steps: skip those whose target element is absent or has no rendered height.
        // This prevents the tour from highlighting empty nav sections (e.g. People & Growth
        // when all features are disabled) or DOM elements that don't exist yet.
        const validSteps = steps.filter(step => {
          if (!step.element) return true; // Welcome / conclusion steps have no target
          const el = document.querySelector(step.element);
          if (!el) return false;
          return el.offsetHeight > 0 || el.scrollHeight > 0;
        });

        if (validSteps.length === 0) {
          localStorage.setItem(tourKey, '1');
          return;
        }

        driverRef.current = driver({
          showProgress:   true,
          animate:        true,
          overlayOpacity: 0.55,
          stagePadding:   10,
          allowClose:     true,
          doneBtnText:    'Done',
          closeBtnText:   'Skip Tour',
          nextBtnText:    'Next →',
          prevBtnText:    '← Back',
          popoverClass:   'lt-tour-popover',
          onDestroyed: () => {
            localStorage.setItem(tourKey, '1');
          },
          steps: validSteps,
        });

        if (!cancelled) driverRef.current.drive();
      } catch { /* silently skip if driver fails to load */ }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      driverRef.current?.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourKey]);
}
