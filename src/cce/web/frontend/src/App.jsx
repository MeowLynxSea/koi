import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Database, Sparkles, Tag, BrainCircuit, Menu, X } from 'lucide-react';

import clsx from 'clsx';

import ContextBrowser from './features/context/ContextBrowser';
import MaintenancePage from './features/maintenance/MaintenancePage';
import NamespacePage from './features/namespace/NamespacePage';
import BrainPage from './features/brain/BrainPage';
import ThemeToggle from './components/ThemeToggle';
import LanguageSwitcher from './components/LanguageSwitcher';
import CatLogo from './components/CatLogo';
import { useTranslation } from './i18n';
import { getNamespaces } from './lib/api';

function Layout() {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { to: '/context', icon: Database, label: t('nav.context'), shortLabel: t('nav.context').charAt(0) },
    { to: '/brain', icon: BrainCircuit, label: t('nav.brain'), shortLabel: t('nav.brain').charAt(0) },
    { to: '/maintenance', icon: Sparkles, label: t('nav.maintenance'), shortLabel: t('nav.maintenance').charAt(0) },
    { to: '/namespaces', icon: Tag, label: t('nav.namespaces'), shortLabel: t('nav.namespaces').charAt(0) },
  ];

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary">
      {/* Top Navigation Bar — responsive */}
      <header className="h-14 sm:h-16 flex items-center px-4 sm:px-6 lg:px-10 border-b border-border-primary bg-surface-primary flex-shrink-0 z-50">
        {/* Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3 mr-4 sm:mr-10 flex-shrink-0">
          <CatLogo className="w-7 h-7 sm:w-8 sm:h-8 text-text-primary" />
          <span className="font-semibold text-text-primary text-sm tracking-tight hidden sm:block">{t('app.title')}</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 h-full">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => clsx(
                "relative flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 btn-press",
                isActive ? "bg-surface-secondary text-brand" : "text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary"
              )}
            >
              <Icon size={16} />
              <span className="hidden lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Mobile nav toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-all ml-2"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-surface-primary border-b border-border-primary overflow-hidden z-40"
          >
            <nav className="flex flex-col p-3 gap-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => clsx(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                    isActive ? "bg-surface-secondary text-brand" : "text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary"
                  )}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
              <div className="flex items-center gap-2 px-4 py-3 mt-2 border-t border-border-primary">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Area */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/context" replace />} />
          <Route path="/context/*" element={<ContextBrowser />} />
          <Route path="/brain" element={<BrainPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/namespaces" element={<NamespacePage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const { t } = useTranslation();
  const [backendError, setBackendError] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        await getNamespaces();
        if (mounted) setBackendError(false);
      } catch {
        if (mounted) setBackendError(true);
      }
    };
    check();
    return () => { mounted = false; };
  }, []);

  if (backendError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-bg-primary text-text-muted animate-fade-in-up">
        <div className="text-xl font-semibold text-text-primary mb-2">{t('app.backendError')}</div>
        <div className="text-sm text-text-muted">{t('app.backendErrorDesc')}</div>
        <button onClick={() => window.location.reload()} className="mt-8 px-6 py-2.5 bg-brand hover:bg-brand-hover text-text-inverse rounded-xl text-sm font-medium transition-all btn-press">
          {t('app.retry')}
        </button>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}

export default App;
