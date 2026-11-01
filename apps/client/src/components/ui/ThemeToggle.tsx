import type React from 'react';
import './ThemeToggle.css';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

export default function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  const handleToggle = (e: React.MouseEvent<HTMLLabelElement>) => {
    e.preventDefault();

    onToggle();
  };

  return (
    <label className="theme-toggle" onClick={handleToggle}>
      <input type="checkbox" className="theme-toggle-input" checked={isDark} readOnly />
      <div className="theme-toggle-switch">
        <svg className="theme-toggle-moon" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"></path>
        </svg>
        <svg className="theme-toggle-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" fill="currentColor"></circle>
          <path
            d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          ></path>
        </svg>
      </div>
    </label>
  );
}
