import React from 'react';
import { useOutletContext } from 'react-router-dom';

export default function ComingSoon({ title, icon }) {
  const { darkMode } = useOutletContext();
  return (
    <div className="p-8 flex items-center justify-center h-96">
      <div className="text-center">
        <div className="text-6xl mb-4">{icon || '🚧'}</div>
        <h2 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {title || 'Coming Soon'}
        </h2>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          This page is under construction. Check back soon!
        </p>
      </div>
    </div>
  );
}
