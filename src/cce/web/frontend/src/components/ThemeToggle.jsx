import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-all duration-300 btn-press"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      <div className="relative w-4 h-4">
        <Sun 
          size={16} 
          className={`absolute inset-0 transition-all duration-500 ${theme === 'dark' ? 'rotate-0 opacity-100 scale-100' : '-rotate-90 opacity-0 scale-50'}`} 
        />
        <Moon 
          size={16} 
          className={`absolute inset-0 transition-all duration-500 ${theme === 'dark' ? 'rotate-90 opacity-0 scale-50' : 'rotate-0 opacity-100 scale-100'}`} 
        />
      </div>
    </button>
  );
};

export default ThemeToggle;
