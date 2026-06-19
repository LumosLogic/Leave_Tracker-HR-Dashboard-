import { useEffect, useRef } from 'react';
import 'driver.js/dist/driver.css';

// Starts a Driver.js tour the first time this hook is mounted for a given key.
// The tour is never shown again once the user completes or skips it.
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

        driverRef.current = driver({
          showProgress:    true,
          animate:         true,
          overlayOpacity:  0.55,
          stagePadding:    10,
          allowClose:      true,
          doneBtnText:     'Done',
          closeBtnText:    'Skip Tour',
          nextBtnText:     'Next →',
          prevBtnText:     '← Back',
          popoverClass:    'lt-tour-popover',
          onDestroyed: () => {
            localStorage.setItem(tourKey, '1');
          },
          steps,
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
