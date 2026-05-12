import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, X, Save, Plus } from 'lucide-react';
import { api } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

const KeywordManager = ({ keywords, nodeUuid, onUpdate }) => {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = async () => {
    const kw = newKeyword.trim();
    if (!kw || !nodeUuid) return;
    try {
      await api.post('/browse/glossary', { keyword: kw, node_uuid: nodeUuid });
      setNewKeyword('');
      setAdding(false);
      onUpdate();
    } catch (err) {
      alert(t('context.keyword.addFailed', { msg: err.response?.data?.detail || err.message }));
    }
  };

  const handleRemove = async (kw) => {
    if (!nodeUuid) return;
    try {
      await api.delete('/browse/glossary', { data: { keyword: kw, node_uuid: nodeUuid } });
      onUpdate();
    } catch (err) {
      alert(t('context.keyword.removeFailed', { msg: err.response?.data?.detail || err.message }));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setAdding(false); setNewKeyword(''); }
  };

  return (
    <div className="flex items-start gap-2 text-xs text-text-muted">
      <Tag size={13} className="flex-shrink-0 mt-0.5 text-warning" />
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-warning font-medium">{t('context.keyword.glossary')}</span>
        <AnimatePresence>
          {keywords.map(kw => (
            <motion.span
              key={kw}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-warning-surface border border-warning-border rounded-lg text-warning font-mono text-[11px]"
            >
              {kw}
              <button onClick={() => handleRemove(kw)} className="text-warning-muted hover:text-warning transition-colors">
                <X size={10} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        {adding ? (
          <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} className="inline-flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => { if (!newKeyword.trim()) setAdding(false); }}
              placeholder={t('context.keyword.placeholder')}
              className="w-28 px-2 py-1 bg-surface-primary border border-warning-border rounded-lg text-warning text-[11px] font-mono focus:outline-none focus:border-warning transition-all"
            />
            <button onClick={handleAdd} className="text-warning-muted hover:text-warning transition-colors">
              <Save size={12} />
            </button>
          </motion.span>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 px-2.5 py-1 border border-dashed border-warning-border rounded-lg text-warning-muted hover:text-warning hover:border-warning transition-colors text-[11px]"
          >
            <Plus size={10} /> {t('context.keyword.add')}
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default KeywordManager;
