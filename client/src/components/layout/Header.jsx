import React, { useState, useEffect } from 'react';
import { GlobalSearchModal } from '@/components/ui/GlobalSearchModal';

// Headless component — no visible UI.
// Registers the Ctrl+K / Cmd+K shortcut and renders GlobalSearchModal.
export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(s => !s);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />;
}

