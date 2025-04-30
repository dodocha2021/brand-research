"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if (saved === 'dark') {
      document.body.classList.add('dark');
      setTheme('dark');
    } else {
      document.body.classList.remove('dark');
      setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    if (theme === 'dark') {
      document.body.classList.remove('dark');
      setTheme('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.add('dark');
      setTheme('dark');
      localStorage.setItem('theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      disabled
      style={{
        position: 'fixed',
        top: 24,
        right: 32,
        zIndex: 1000,
        background: theme === 'dark' ? '#23232b' : '#fff',
        color: theme === 'dark' ? '#fff' : '#23232b',
        border: '1.5px solid #bbb',
        borderRadius: 24,
        fontSize: 18,
        fontWeight: 600,
        padding: '8px 20px 8px 16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        cursor: 'not-allowed',
        opacity: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.2s',
      }}
      aria-label="Toggle theme"
    >
      <span style={{ fontSize: 22 }}>
        {theme === 'dark' ? '🌞' : '🌙'}
      </span>
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
