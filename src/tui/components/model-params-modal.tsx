/**
 * Model Parameters Modal
 *
 * Edit per-model parameters for custom provider models:
 * - Context Window
 * - Max Tokens
 * - Input Cost ($/1M tokens)
 * - Output Cost ($/1M tokens)
 */

import { useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { TextareaRenderable, MouseEvent } from "@opentui/core";
import {
  getCustomModelConfig,
  updateCustomModelParams,
} from "../../config/settings.js";

interface ModelParamsModalProps {
  isActive: boolean;
  provider: string;
  modelId: string;
  onClose: () => void;
}

type FieldKey = "contextWindow" | "maxTokens" | "costInput" | "costOutput";

interface FieldDef {
  key: FieldKey;
  label: string;
  placeholder: string;
}

const FIELDS: FieldDef[] = [
  { key: "contextWindow", label: "Context Window", placeholder: "e.g., 128000" },
  { key: "maxTokens", label: "Max Tokens", placeholder: "e.g., 4096" },
  { key: "costInput", label: "Input Cost ($/1M)", placeholder: "e.g., 0.5" },
  { key: "costOutput", label: "Output Cost ($/1M)", placeholder: "e.g., 1.5" },
];

const DEFAULT_VALUES: Record<FieldKey, string> = {
  contextWindow: "128000",
  maxTokens: "4096",
  costInput: "0",
  costOutput: "0",
};

export function ModelParamsModal({
  isActive,
  provider,
  modelId,
  onClose,
}: ModelParamsModalProps) {
  const { width, height } = useTerminalDimensions();
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fieldRefs = [
    useRef<TextareaRenderable>(null),
    useRef<TextareaRenderable>(null),
    useRef<TextareaRenderable>(null),
    useRef<TextareaRenderable>(null),
  ];

  const modalWidth = Math.min(70, Math.max(50, width - 10));

  // Reset when opened
  useEffect(() => {
    if (!isActive) return;

    setSelectedFieldIndex(0);
    setError(null);
    setSaved(false);

    // Load existing values
    const existing = getCustomModelConfig(provider, modelId);
    const values: Record<FieldKey, string> = {
      contextWindow: existing?.contextWindow?.toString() ?? DEFAULT_VALUES.contextWindow,
      maxTokens: existing?.maxTokens?.toString() ?? DEFAULT_VALUES.maxTokens,
      costInput: existing?.costInput?.toString() ?? DEFAULT_VALUES.costInput,
      costOutput: existing?.costOutput?.toString() ?? DEFAULT_VALUES.costOutput,
    };

    // Set textarea values after a brief delay for focus
    setTimeout(() => {
      fieldRefs.forEach((ref, idx) => {
        const fieldKey = FIELDS[idx]!.key;
        ref.current?.editBuffer.replaceText(values[fieldKey]);
      });
      fieldRefs[0]?.current?.focus();
    }, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, provider, modelId]);

  // Focus current field when index changes
  useEffect(() => {
    if (!isActive) return;
    fieldRefs[selectedFieldIndex]?.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldIndex, isActive]);

  const validateAndSave = (): boolean => {
    const rawValues: Record<FieldKey, string> = {
      contextWindow: fieldRefs[0]!.current?.editBuffer.getText() ?? "",
      maxTokens: fieldRefs[1]!.current?.editBuffer.getText() ?? "",
      costInput: fieldRefs[2]!.current?.editBuffer.getText() ?? "",
      costOutput: fieldRefs[3]!.current?.editBuffer.getText() ?? "",
    };

    const parsed: Partial<Record<FieldKey, number>> = {};

    for (const field of FIELDS) {
      const raw = rawValues[field.key].trim();
      if (!raw) {
        setError(`${field.label} is required`);
        const idx = FIELDS.findIndex((f) => f.key === field.key);
        setSelectedFieldIndex(idx);
        return false;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        setError(`${field.label} must be a non-negative number`);
        const idx = FIELDS.findIndex((f) => f.key === field.key);
        setSelectedFieldIndex(idx);
        return false;
      }
      parsed[field.key] = num;
    }

    updateCustomModelParams(provider, modelId, {
      contextWindow: parsed.contextWindow,
      maxTokens: parsed.maxTokens,
      costInput: parsed.costInput,
      costOutput: parsed.costOutput,
    });

    setError(null);
    setSaved(true);
    return true;
  };

  useKeyboard((key) => {
    if (!isActive) return;

    if (key.name === "escape") {
      onClose();
      return;
    }

    if (saved) {
      if (key.name === "return") {
        onClose();
      }
      return;
    }

    if (key.name === "tab" || key.name === "TAB") {
      setSelectedFieldIndex((prev) => (prev + 1) % FIELDS.length);
      setError(null);
      return;
    }

    if (key.name === "up" || key.name === "down") {
      setSelectedFieldIndex((prev) => {
        if (key.name === "up") {
          return prev > 0 ? prev - 1 : FIELDS.length - 1;
        }
        return (prev + 1) % FIELDS.length;
      });
      setError(null);
      return;
    }

    if (key.name === "return") {
      validateAndSave();
      return;
    }
  });

  if (!isActive) return null;

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor="#00000080"
      alignItems="center"
      justifyContent="center"
      onMouseUp={(e: MouseEvent) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <box
        flexDirection="column"
        alignSelf="center"
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
        width={modalWidth}
        maxHeight={Math.max(10, height - 6)}
        onMouseUp={(e: MouseEvent) => e.stopPropagation()}
      >
        <text
          alignSelf="center"
          attributes={createTextAttributes({ bold: true })}
          fg="#60a5fa"
        >
          Model Parameters: {modelId}
        </text>

        {/* Separator */}
        <box height={1} marginTop={1}>
          <text fg="#4a4a5a">{"─".repeat(modalWidth - 4)}</text>
        </box>

        {saved ? (
          <>
            <text
              alignSelf="center"
              attributes={createTextAttributes({ bold: true })}
              fg="#00ff99"
              marginTop={1}
            >
              Saved!
            </text>
            <box marginTop={2}>
              <text
                fg="#6c6c7c"
                alignSelf="center"
                attributes={createTextAttributes({ dim: true })}
              >
                Enter/Esc Close
              </text>
            </box>
          </>
        ) : (
          <>
            <box flexDirection="column" gap={1} marginTop={1}>
              {FIELDS.map((field, idx) => (
                <box
                  key={field.key}
                  flexDirection="row"
                  alignItems="center"
                  gap={2}
                >
                  <text
                    fg={idx === selectedFieldIndex ? "#ff79c6" : "#f8f8f2"}
                    width={20}
                    attributes={createTextAttributes({
                      bold: idx === selectedFieldIndex,
                    })}
                  >
                    {idx === selectedFieldIndex ? "▶ " : "  "}
                    {field.label}:
                  </text>
                  <box
                    width={25}
                    height={1}
                    backgroundColor={
                      idx === selectedFieldIndex ? "#16213e" : "#0d1117"
                    }
                    paddingX={1}
                  >
                    <textarea
                      ref={fieldRefs[idx]}
                      initialValue={DEFAULT_VALUES[field.key]}
                      focused={isActive && idx === selectedFieldIndex}
                      showCursor={idx === selectedFieldIndex}
                      height={1}
                      wrapMode="none"
                      textColor="#f8f8f2"
                      backgroundColor={
                        idx === selectedFieldIndex ? "#16213e" : "#0d1117"
                      }
                      onContentChange={() => setError(null)}
                    />
                  </box>
                </box>
              ))}
            </box>

            {/* Hint */}
            <box marginTop={1}>
              <text
                fg="#6c6c7c"
                attributes={createTextAttributes({ dim: true })}
              >
                Tab/↑↓ Navigate  Enter Save  Esc Cancel
              </text>
            </box>

            {/* Error message */}
            {error && (
              <box marginTop={1}>
                <text fg="#f43f5e">{error}</text>
              </box>
            )}
          </>
        )}
      </box>
    </box>
  );
}
