import React from 'react';
import { initials } from '@/lib/utils';

export function Avatar({ name, color = '#3525cd', size = 36, className = '' }) {
  const style = {
    width: size, height: size,
    background: color,
    fontSize: size * 0.33,
    flexShrink: 0,
  };
  return (
    <div
      className={`rounded-full flex items-center justify-center font-black text-white border-2 border-white/90 shadow-md ${className}`}
      style={style}
    >
      {initials(name)}
    </div>
  );
}
