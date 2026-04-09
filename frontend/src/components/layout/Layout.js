import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className={`flex h-screen ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
        <Sidebar darkMode={darkMode} setDarkMode={setDarkMode} />
        <main className="flex-1 ml-64 overflow-y-auto">
          <Outlet context={{ darkMode }} />
        </main>
      </div>
    </div>
  );
}
