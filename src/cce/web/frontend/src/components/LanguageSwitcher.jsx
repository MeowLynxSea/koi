import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from '../i18n';

const LanguageSwitcher = () => {
  const { locale, setLocale } = useTranslation();

  const toggle = () => {
    setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN');
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-all duration-300 text-xs font-medium btn-press"
      title={locale === 'zh-CN' ? 'Switch to English' : '切换到中文'}
      aria-label="Switch language"
    >
      <Globe size={14} />
      <span className="uppercase tracking-wide">{locale === 'zh-CN' ? 'EN' : '中'}</span>
    </button>
  );
};

export default LanguageSwitcher;
