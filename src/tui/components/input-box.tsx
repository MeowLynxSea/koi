/**
 * Input Box Component
 *
 * Multiline text input with prefix and horizontal borders.
 * Uses OpenTUI <textarea> for editing logic.
 * Supports user message history navigation via ArrowUp/ArrowDown.
 */

import { useRef, useMemo, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { createTextAttributes, type TextareaRenderable, type KeyBinding } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import type { AgentMode } from "../../agent/mode.js";
import {
  addToUserHistory,
  getUserHistory,
} from "../hooks/user-prompt-history.js";

const MODE_PREFIX: Record<AgentMode, string> = {
  build: "Build > ",
  ask: "Ask > ",
  plan: "Plan > ",
};

const MODE_COLOR: Record<AgentMode, string> = {
  build: "#4ade80",
  ask: "#fbbf24",
  plan: "#60a5fa",
};

// Ink wave animation phases - pure black/white/gray water ripple
const INK_WAVE_PHASES = [
  { phase: 0 },
  { phase: 0.25 },
  { phase: 0.5 },
  { phase: 0.75 },
  { phase: 1.0 },
  { phase: 1.25 },
  { phase: 1.5 },
  { phase: 1.75 },
  { phase: 2.0 },
  { phase: 2.25 },
  { phase: 2.5 },
  { phase: 2.75 },
  { phase: 3.0 },
  { phase: 3.25 },
  { phase: 3.5 },
  { phase: 3.75 },
];

export interface InputBoxHandle {
  clearInput: () => void;
  isInputEmpty: () => boolean;
}

interface InputBoxProps {
  onSubmit: (value: string) => void;
  onQueueSubmit?: (value: string) => void;
  onSlashEmpty?: () => void;
  focused?: boolean;
  disabled?: boolean;
  width?: number;
  mode?: AgentMode;
  isBusy?: boolean;
  onModeSwitch?: () => void;
}

export const InputBox = forwardRef<InputBoxHandle, InputBoxProps>(function InputBox({
  onSubmit,
  onQueueSubmit,
  onSlashEmpty,
  focused = true,
  disabled = false,
  width,
  mode = "build",
  isBusy = false,
  onModeSwitch,
}: InputBoxProps, ref) {
  const textareaRef = useRef<TextareaRenderable | null>(null);

  // History navigation state
  // historyIndex: -1 means not browsing history, 0 means viewing the first history item
  const [historyIndex, setHistoryIndex] = useState(-1);
  // savedInput: preserves user's original input when they start browsing history
  const [savedInput, setSavedInput] = useState("");

  const getText = () => textareaRef.current?.editBuffer.getText() ?? "";

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    clearInput: () => {
      textareaRef.current?.editBuffer.replaceText("");
      setHistoryIndex(-1);
      setSavedInput("");
    },
    isInputEmpty: () => getText().trim() === "",
  }), []);

  // Navigate to previous history item (ArrowUp) - replaces input text
  const navigateToPreviousHistory = useCallback(() => {
    const history = getUserHistory();
    if (history.length === 0) return;

    // If not already browsing history, save current input and start browsing
    if (historyIndex === -1) {
      setSavedInput(getText());
      setHistoryIndex(0);
      textareaRef.current?.editBuffer.replaceText(history[0]!);
      return;
    }

    // Move to the next older entry
    const nextIndex = historyIndex + 1;
    if (nextIndex < history.length) {
      setHistoryIndex(nextIndex);
      textareaRef.current?.editBuffer.replaceText(history[nextIndex]!);
    }
  }, [historyIndex]);

  // Navigate to next history item (ArrowDown) - replaces input text
  const navigateToNextHistory = useCallback(() => {
    const history = getUserHistory();
    
    // If not browsing history, nothing to do
    if (historyIndex === -1) return;

    // Move to the next newer entry (decrement index)
    const nextIndex = historyIndex - 1;
    
    if (nextIndex >= 0) {
      setHistoryIndex(nextIndex);
      textareaRef.current?.editBuffer.replaceText(history[nextIndex]!);
    } else {
      // Reached past the beginning, restore saved input
      setHistoryIndex(-1);
      textareaRef.current?.editBuffer.replaceText(savedInput);
      setSavedInput("");
    }
  }, [historyIndex, savedInput]);

  const handleSubmit = () => {
    const text = getText();
    if (text.trim()) {
      // Add to history before submitting
      addToUserHistory(text);
      onSubmit(text);
      textareaRef.current?.editBuffer.replaceText("");
      // Reset history navigation state
      setHistoryIndex(-1);
      setSavedInput("");
    }
  };

  const handleKeyDown = (event: KeyEvent) => {
    // Handle ArrowUp for history navigation
    if (event.name === "up" && !event.ctrl && !event.meta && !event.option) {
      const history = getUserHistory();
      if (history.length > 0) {
        const editBuffer = textareaRef.current?.editBuffer;
        if (editBuffer) {
          const cursorPos = editBuffer.getCursorPosition();
          // If cursor is on the first line, switch to previous history item
          if (cursorPos.row <= 0) {
            event.preventDefault();
            event.stopPropagation();
            navigateToPreviousHistory();
            return;
          }
          // Otherwise, let textarea handle natural line navigation
        } else {
          // Fallback: if we can't get cursor position, navigate history anyway
          event.preventDefault();
          event.stopPropagation();
          navigateToPreviousHistory();
          return;
        }
      }
    }

    // Handle ArrowDown for history navigation
    if (event.name === "down" && !event.ctrl && !event.meta && !event.option) {
      // Only navigate to next history when cursor is on the last line
      if (historyIndex !== -1) {
        const editBuffer = textareaRef.current?.editBuffer;
        if (editBuffer) {
          const cursorPos = editBuffer.getCursorPosition();
          const lineCount = editBuffer.getLineCount();
          // If cursor is on the last line, switch to next history item
          if (cursorPos.row >= lineCount - 1) {
            event.preventDefault();
            event.stopPropagation();
            navigateToNextHistory();
            return;
          }
          // Otherwise, let textarea handle natural line navigation
        }
      }
    }

    if (event.name === "tab" && event.shift && onModeSwitch && !isBusy) {
      event.preventDefault();
      event.stopPropagation();
      onModeSwitch();
      return;
    }
    if (event.name === "/" && getText() === "" && onSlashEmpty) {
      event.preventDefault();
      event.stopPropagation();
      onSlashEmpty();
      return;
    }
    if (event.name === "return" && event.ctrl && onQueueSubmit) {
      event.preventDefault();
      event.stopPropagation();
      const text = getText();
      if (text.trim()) {
        addToUserHistory(text);
        onQueueSubmit(text);
        textareaRef.current?.editBuffer.replaceText("");
        setHistoryIndex(-1);
        setSavedInput("");
      }
    }
  };

  const keyBindings = useMemo<KeyBinding[]>(
    () => [
      { name: "return", action: "submit" },
      { name: "return", shift: true, action: "newline" },
    ],
    []
  );

  // Ink wave animation state - phase index for ripple effect
  const [wavePhase, setWavePhase] = useState(0);

  // Shimmer animation state - the highlight position index
  const [shimmerIndex, setShimmerIndex] = useState(-1);

  // Animate ink wave effect when busy - elegant ripple
  useEffect(() => {
    if (!isBusy) return;
    const interval = setInterval(() => {
      setWavePhase((p) => (p + 1) % INK_WAVE_PHASES.length);
    }, 150); // 150ms for smooth wave
    return () => clearInterval(interval);
  }, [isBusy]);

  // Animate shimmer effect when busy - left to right highlight sweep
  useEffect(() => {
    if (!isBusy) {
      setShimmerIndex(-1);
      return;
    }
    // Start shimmer animation
    const modeText = MODE_PREFIX[mode];
    const textLength = modeText.length;
    let currentIdx = -1;
    
    const interval = setInterval(() => {
      currentIdx = (currentIdx + 1) % (textLength + 4); // +4 for pause at ends
      if (currentIdx >= textLength) {
        setShimmerIndex(-1); // Hide during pause
      } else {
        setShimmerIndex(currentIdx);
      }
    }, 80); // 80ms per step for smooth sweep
    return () => clearInterval(interval);
  }, [isBusy, mode]);

  // Generate ink wave characters - pure black/white/gray elegant wave
  const getInkWaveChars = useCallback(() => {
    const totalWidth = width ?? 80;
    const phaseData = INK_WAVE_PHASES[wavePhase];
    if (!phaseData) return [];
    
    const p = phaseData.phase;
    const chars: Array<{ char: string; color: string }> = [];
    
    for (let i = 0; i < totalWidth; i++) {
      const wavelength = 25;
      const waveNum = (2 * Math.PI) / wavelength;
      const omega = 1.5;
      
      // Left source vibration: complex and organic
      const leftAmp1 = Math.sin(p * 3.7) * 0.3;
      const leftAmp2 = Math.sin(p * 5.1 + 0.9) * 0.2;
      const leftAmp3 = Math.sin(p * 2.3 + 1.5) * 0.15;
      const leftAmp4 = Math.sin(p * 7.3 + 2.3) * 0.1;
      const leftAmplitude = 0.4 + leftAmp1 + leftAmp2 + leftAmp3 + leftAmp4;
      const leftDecay = Math.exp(-i / 35);
      const leftWave = Math.sin(waveNum * i - omega * p) * leftAmplitude * leftDecay;
      
      // Right source vibration: different organic pattern
      const rightAmp1 = Math.sin(p * 4.1 + 1.1) * 0.3;
      const rightAmp2 = Math.sin(p * 5.7 + 2.3) * 0.2;
      const rightAmp3 = Math.sin(p * 2.9 + 0.8) * 0.15;
      const rightAmp4 = Math.sin(p * 6.5 + 3.1) * 0.1;
      const rightAmplitude = 0.4 + rightAmp1 + rightAmp2 + rightAmp3 + rightAmp4;
      const distFromRight = totalWidth - 1 - i;
      const rightDecay = Math.exp(-distFromRight / 35);
      const rightWave = Math.sin(waveNum * distFromRight - omega * p + Math.PI) * rightAmplitude * rightDecay;
      
      // Two waves interfere
      const combined = (leftWave + rightWave) * 0.5 + 0.5;
      
      // Map to hex gray color (40-200 range)
      const gray = Math.round(40 + Math.max(0, Math.min(1, combined)) * 160);
      const color = `#${gray.toString(16).padStart(2, '0')}${gray.toString(16).padStart(2, '0')}${gray.toString(16).padStart(2, '0')}`;
      
      // Character selection - thicker at peaks
      let char = "─";
      if (combined > 0.85) {
        char = "━";
      } else if (combined > 0.7 && Math.sin(waveNum * i - omega * p) > 0.3) {
        char = "～";
      }
      
      chars.push({ char, color });
    }
    return chars;
  }, [wavePhase, width]);

  // Get border color for bottom only
  const getBottomBorderColor = () => {
    if (disabled) return "#333333";
    return "gray";
  };

  const inputWidth = Math.max(1, (width ?? 80) - 2);
  const inkWaveChars = isBusy ? getInkWaveChars() : null;

  return (
    <box
      width={width}
      height={5}
      flexDirection="column"
      border={["bottom"]}
      borderStyle="single"
      borderColor={getBottomBorderColor()}
      paddingX={1}
      overflow="hidden"
    >
      {/* Custom ink wave top border - 水墨风格波纹 */}
      <box width={width} height={1} flexDirection="row">
        {inkWaveChars ? (
          inkWaveChars.map((item, i) => (
            <text key={i} fg={item.color}>{item.char}</text>
          ))
        ) : (
          // Static gray line when not busy
          Array.from({ length: inputWidth }).map((_, i) => (
            <text key={i} fg="gray">─</text>
          ))
        )}
      </box>
      <box flexDirection="row" height={3}>
        {/* Mode prefix with shimmer effect - row of characters */}
        <box flexDirection="row" marginRight={1} flexShrink={0}>
          {(() => {
            const modeText = MODE_PREFIX[mode];
            const highlightColor = mode === "build" ? "#86efac" : 
                                   mode === "ask" ? "#fde68a" : "#93c5fd";
            const nearColor = mode === "build" ? "#bbf7d0" : 
                              mode === "ask" ? "#fef08a" : "#bfdbfe";
            
            return modeText.split('').map((char, i) => {
              const isHighlighted = isBusy && shimmerIndex === i;
              const isNearHighlight = isBusy && shimmerIndex !== -1 && 
                (shimmerIndex === i - 1 || shimmerIndex === i + 1);
              
              if (isHighlighted) {
                return <text key={i} fg={highlightColor} attributes={createTextAttributes({ bold: true })}>{char}</text>;
              }
              if (isNearHighlight) {
                return <text key={i} fg={nearColor} attributes={createTextAttributes({ bold: true })}>{char}</text>;
              }
              return <text key={i} fg={MODE_COLOR[mode]} attributes={createTextAttributes({ bold: true })}>{char}</text>;
            });
          })()}
        </box>
        <box flexGrow={1} height={3}>
          <textarea
            ref={textareaRef}
            focused={focused}
            showCursor={true}
            height={3}
            width={Math.max(1, (width ?? 80) - MODE_PREFIX[mode].length - 2)}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            keyBindings={keyBindings}
          />
        </box>
      </box>
    </box>
  );
});
