import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, X } from 'lucide-react';
import clsx from 'clsx';

function findAllOccurrences(text, keywords) {
  if (!keywords || keywords.length === 0 || !text) return [];
  const matches = [];
  for (const entry of keywords) {
    if (!entry.keyword) continue;
    let idx = text.indexOf(entry.keyword);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + entry.keyword.length, keyword: entry.keyword, nodes: entry.nodes });
      idx = text.indexOf(entry.keyword, idx + entry.keyword.length);
    }
  }
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const result = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) { result.push(m); lastEnd = m.end; }
  }
  return result;
}

const GlossaryPopup = ({ keyword, nodes, position, onClose, onNavigate }) => {
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return createPortal(
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-[100] w-72 bg-surface-primary border border-warning-border rounded-2xl shadow-lg overflow-hidden flex flex-col"
      style={{
        left: position.x,
        ...(position.isAbove
          ? { bottom: window.innerHeight - position.spanTop + 4, maxHeight: position.spanTop - 16 }
          : { top: position.y + 4, maxHeight: window.innerHeight - position.y - 16 })
      }}
    >
      <div className="px-4 py-3 border-b border-border-primary flex items-center gap-2 flex-shrink-0">
        <BookOpen size={12} className="text-warning" />
        <span className="text-xs font-semibold text-warning font-mono">{keyword}</span>
        <button onClick={onClose} className="ml-auto text-text-muted hover:text-text-secondary transition-colors p-1 rounded-lg hover:bg-surface-secondary">
          <X size={12} />
        </button>
      </div>
      <div className="p-2 overflow-y-auto custom-scrollbar flex-1">
        {nodes.map((node, i) => {
          const isUnlinked = node.uri?.startsWith('unlinked://');
          return (
            <button
              key={node.uri || i}
              onClick={() => { if (isUnlinked) return; const match = node.uri?.match(/^([^:]+):\/\/(.*)$/); if (match) onNavigate(match[2], match[1]); onClose(); }}
              className={clsx("w-full text-left px-3 py-2.5 rounded-xl transition-colors group relative mb-1", isUnlinked ? "cursor-default opacity-80 bg-surface-secondary" : "hover:bg-surface-secondary cursor-pointer")}
            >
              <div className="flex items-center justify-between gap-2">
                <code className={clsx("text-[11px] font-mono block truncate flex-1", isUnlinked ? "text-text-muted" : "text-brand-muted group-hover:text-brand")}>{node.uri}</code>
                {isUnlinked && <span className="text-[9px] px-2 py-0.5 bg-danger-surface text-danger border border-danger-border rounded-lg flex-shrink-0">Orphaned</span>}
              </div>
              {node.content_snippet && <p className="text-[10px] text-text-muted mt-1 line-clamp-2 leading-snug">{node.content_snippet}</p>}
            </button>
          );
        })}
      </div>
    </motion.div>,
    document.body
  );
};

const GlossaryHighlighter = ({ content, glossary, currentNodeUuid, onNavigate }) => {
  const [popup, setPopup] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => { setPopup(null); }, [content]);

  const filteredGlossary = useMemo(() => {
    if (!glossary) return [];
    return glossary.map(entry => {
      const filteredNodes = entry.nodes?.filter(n => n.node_uuid !== currentNodeUuid) || [];
      return { ...entry, nodes: filteredNodes };
    }).filter(entry => entry.nodes.length > 0);
  }, [glossary, currentNodeUuid]);

  const matches = useMemo(() => findAllOccurrences(content, filteredGlossary), [content, filteredGlossary]);

  const handleKeywordClick = useCallback((e, match) => {
    const spanRect = e.target.getBoundingClientRect();
    const popupWidth = 288;
    let x = spanRect.left;
    if (x + popupWidth > window.innerWidth - 16) { x = window.innerWidth - popupWidth - 16; if (x < 16) x = 16; }
    const estimatedHeight = 250;
    let y = spanRect.bottom;
    let isAbove = false;
    if (y + estimatedHeight > window.innerHeight - 16 && spanRect.top > estimatedHeight + 16) isAbove = true;
    setPopup({ keyword: match.keyword, nodes: match.nodes, position: { x, y, isAbove, spanTop: spanRect.top } });
  }, []);

  if (matches.length === 0) {
    return <pre className="whitespace-pre-wrap font-mono text-text-secondary leading-7">{content}</pre>;
  }

  const parts = [];
  let lastIdx = 0;
  for (const m of matches) {
    if (m.start > lastIdx) parts.push({ text: content.slice(lastIdx, m.start), isMatch: false });
    parts.push({ text: content.slice(m.start, m.end), isMatch: true, match: m });
    lastIdx = m.end;
  }
  if (lastIdx < content.length) parts.push({ text: content.slice(lastIdx), isMatch: false });

  return (
    <div ref={containerRef} className="relative">
      <pre className="whitespace-pre-wrap font-mono text-text-secondary leading-7">
        {parts.map((part, i) =>
          part.isMatch ? (
            <motion.span
              key={i}
              whileHover={{ scale: 1.02 }}
              className="text-warning cursor-pointer underline decoration-dotted decoration-warning-border hover:decoration-warning hover:text-warning transition-colors rounded px-0.5 font-mono"
              onClick={(e) => handleKeywordClick(e, part.match)}
            >
              {part.text}
            </motion.span>
          ) : (
            <React.Fragment key={i}>{part.text}</React.Fragment>
          )
        )}
      </pre>
      <AnimatePresence>
        {popup && (
          <GlossaryPopup
            keyword={popup.keyword}
            nodes={popup.nodes}
            position={popup.position}
            onClose={() => setPopup(null)}
            onNavigate={onNavigate}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default GlossaryHighlighter;
