/**
 * Custom Provider Modal
 *
 * Two-step flow for adding custom providers:
 * Step 1: Select API format (OpenAI Responses / Anthropic Messages)
 * Step 2: Enter provider details (name, BaseURL, API Key, Model ID)
 */

import { useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { TextareaRenderable, MouseEvent } from "@opentui/core";
import {
  configureCustomProvider,
  type ApiFormat,
} from "../../config/settings.js";

interface CustomProviderModalProps {
  isActive: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = "format" | "form" | "verify" | "result";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const FORMAT_OPTIONS: Array<{ id: ApiFormat; name: string; description: string; placeholder: string }> = [
  {
    id: "openai-responses",
    name: "OpenAI Responses",
    description: "Use OpenAI Responses API format",
    placeholder: "e.g., gpt-4o, gpt-4o-mini",
  },
  {
    id: "anthropic-messages",
    name: "Anthropic Messages",
    description: "Use Anthropic Messages API format",
    placeholder: "e.g., claude-3-5-sonnet-20241022",
  },
];

const DEFAULT_BASE_URLS: Record<ApiFormat, string> = {
  "openai-responses": "https://api.openai.com/v1",
  "anthropic-messages": "https://api.anthropic.com/v1",
};

export function CustomProviderModal({ isActive, onClose, onSuccess }: CustomProviderModalProps) {
  const { width, height } = useTerminalDimensions();
  const [step, setStep] = useState<Step>("format");
  const [selectedFormatIndex, setSelectedFormatIndex] = useState(0);
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<TextareaRenderable>(null);
  const baseUrlRef = useRef<TextareaRenderable>(null);
  const apiKeyRef = useRef<TextareaRenderable>(null);
  const modelIdRef = useRef<TextareaRenderable>(null);

  const modalWidth = Math.min(70, Math.max(50, width - 10));

  // Reset on open
  useEffect(() => {
    if (isActive) {
      setStep("format");
      setSelectedFormatIndex(0);
      setProviderName("");
      setBaseUrl("");
      setApiKey("");
      setModelId("");
      setResult(null);
      setError(null);
    }
  }, [isActive]);

  // Focus name input when entering form step
  useEffect(() => {
    if (isActive && step === "form") {
      setTimeout(() => {
        nameRef.current?.editBuffer.replaceText("");
        nameRef.current?.focus();
      }, 10);
    }
  }, [isActive, step]);

  // Spinner animation during verify
  useEffect(() => {
    if (!isActive || step !== "verify") return;
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isActive, step]);

  const selectedFormat = FORMAT_OPTIONS[selectedFormatIndex];

  const handleFormatSelect = (index: number) => {
    const formatOption = FORMAT_OPTIONS[index];
    if (!formatOption) return;
    setSelectedFormatIndex(index);
    setStep("form");
    setBaseUrl(DEFAULT_BASE_URLS[formatOption.id]);
  };

  const validateForm = (): string | null => {
    if (!providerName.trim()) return "Provider name is required";
    if (!baseUrl.trim()) return "BaseURL is required";
    if (!apiKey.trim()) return "API Key is required";
    if (!modelId.trim()) return "Model IDs is required";
    return null;
  };

  const handleSubmit = () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setStep("verify");

    // Simulate verification (custom providers are always valid if fields are filled)
    setTimeout(() => {
      const formatOption = FORMAT_OPTIONS[selectedFormatIndex];
      if (!formatOption) return;
      const format = formatOption.id;
      // Parse comma-separated model IDs
      const modelIds = modelId
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      configureCustomProvider({
        provider: providerName.trim(),
        authMethod: "apikey",
        credential: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        apiFormat: format,
        modelIds,
      });

      setResult({
        success: true,
        message: `Custom provider "${providerName.trim()}" added successfully!`,
      });
      setStep("result");
    }, 1000);
  };

  useKeyboard((key) => {
    if (!isActive) return;

    if (key.name === "escape") {
      if (step === "format") {
        onClose();
      } else if (step === "form") {
        setStep("format");
      } else if (step === "result") {
        if (result?.success) {
          onSuccess?.();
        }
        onClose();
      }
      return;
    }

    if (step === "format") {
      if (key.name === "up" || key.name === "down") {
        setSelectedFormatIndex((prev) =>
          key.name === "up"
            ? Math.max(0, prev - 1)
            : Math.min(FORMAT_OPTIONS.length - 1, prev + 1)
        );
        return;
      }
      if (key.name === "return" || key.name === " " || key.name === "space") {
        handleFormatSelect(selectedFormatIndex);
        return;
      }
    }

    if (step === "form") {
      if (key.name === "return") {
        handleSubmit();
        return;
      }
    }

    if (step === "result") {
      if (key.name === "return") {
        if (result?.success) {
          onSuccess?.();
        }
        onClose();
        return;
      }
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
        if (step === "format") {
          onClose();
        }
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
        {step === "format" && (
          <>
            <text alignSelf="center" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
              Add Custom Provider
            </text>

            {/* Separator */}
            <box height={1} marginTop={1}>
              <text fg="#4a4a5a">
                {"─".repeat(modalWidth - 4)}
              </text>
            </box>

            <text marginTop={1} fg="#6c6c7c">
              Select API Format:
            </text>

            {/* Format options */}
            <box flexDirection="column" gap={1} marginTop={1}>
              {FORMAT_OPTIONS.map((format, idx) => (
                <box
                  key={format.id}
                  flexDirection="column"
                  paddingX={2}
                  paddingY={1}
                  backgroundColor={idx === selectedFormatIndex ? "#44475a" : "#16213e"}
                  onMouseUp={(e: MouseEvent) => {
                    e.stopPropagation();
                    handleFormatSelect(idx);
                  }}
                >
                  <text
                    fg={idx === selectedFormatIndex ? "#bd93f9" : "#f8f8f2"}
                    attributes={createTextAttributes({ bold: idx === selectedFormatIndex })}
                  >
                    {idx === selectedFormatIndex ? "▶ " : "  "}
                    {format.name}
                  </text>
                  <text fg="#6c6c7c" marginLeft={2}>
                    {format.description}
                  </text>
                </box>
              ))}
            </box>

            <box marginTop={2}>
              <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                ↑↓ Navigate  Enter/Space Select  Esc Cancel
              </text>
            </box>
          </>
        )}

        {step === "form" && (
          <>
            <text alignSelf="center" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
              Configure: {selectedFormat?.name}
            </text>

            {/* Separator */}
            <box height={1} marginTop={1}>
              <text fg="#4a4a5a">
                {"─".repeat(modalWidth - 4)}
              </text>
            </box>

            {/* Form fields */}
            <box flexDirection="column" gap={1} marginTop={1}>
              {/* Provider Name */}
              <box flexDirection="row" alignItems="center" gap={2}>
                <text fg="#f8f8f2" width={12}>
                  Provider Name:
                </text>
                <box width={40} height={1} backgroundColor="#16213e" paddingX={1}>
                  <textarea
                    ref={nameRef}
                    initialValue={providerName}
                    focused={isActive}
                    showCursor
                    height={1}
                    wrapMode="none"
                    textColor="#f8f8f2"
                    backgroundColor="#16213e"
                    onContentChange={() => {
                      setProviderName(nameRef.current?.editBuffer.getText() ?? "");
                      setError(null);
                    }}
                  />
                </box>
              </box>

              {/* BaseURL */}
              <box flexDirection="row" alignItems="center" gap={2}>
                <text fg="#f8f8f2" width={12}>
                  BaseURL:
                </text>
                <box width={40} height={1} backgroundColor="#16213e" paddingX={1}>
                  <textarea
                    ref={baseUrlRef}
                    initialValue={baseUrl}
                    focused={isActive}
                    showCursor
                    height={1}
                    wrapMode="none"
                    textColor="#f8f8f2"
                    backgroundColor="#16213e"
                    onContentChange={() => {
                      setBaseUrl(baseUrlRef.current?.editBuffer.getText() ?? "");
                      setError(null);
                    }}
                  />
                </box>
              </box>

              {/* API Key */}
              <box flexDirection="row" alignItems="center" gap={2}>
                <text fg="#f8f8f2" width={12}>
                  API Key:
                </text>
                <box width={40} height={1} backgroundColor="#16213e" paddingX={1}>
                  <textarea
                    ref={apiKeyRef}
                    initialValue={apiKey}
                    focused={isActive}
                    showCursor
                    height={1}
                    wrapMode="none"
                    textColor="#f8f8f2"
                    backgroundColor="#16213e"
                    onContentChange={() => {
                      setApiKey(apiKeyRef.current?.editBuffer.getText() ?? "");
                      setError(null);
                    }}
                  />
                </box>
              </box>

              {/* Model IDs */}
              <box flexDirection="row" alignItems="center" gap={2}>
                <text fg="#f8f8f2" width={12}>
                  Model IDs:
                </text>
                <box width={40} height={1} backgroundColor="#16213e" paddingX={1}>
                  <textarea
                    ref={modelIdRef}
                    initialValue={modelId}
                    focused={isActive}
                    showCursor
                    height={1}
                    wrapMode="none"
                    textColor="#f8f8f2"
                    backgroundColor="#16213e"
                    onContentChange={() => {
                      setModelId(modelIdRef.current?.editBuffer.getText() ?? "");
                      setError(null);
                    }}
                  />
                </box>
              </box>

              {/* Placeholder hint */}
              <box marginTop={0}>
                <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                  Comma-separated: {selectedFormat?.placeholder}
                </text>
              </box>

              {/* Error message */}
              {error && (
                <box marginTop={1}>
                  <text fg="#f43f5e">
                    {error}
                  </text>
                </box>
              )}
            </box>

            <box marginTop={2}>
              <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                Enter Confirm  Esc Back
              </text>
            </box>
          </>
        )}

        {step === "verify" && (
          <>
            <text alignSelf="center" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
              Verifying
            </text>

            <box marginTop={2} flexDirection="row" alignItems="center" justifyContent="center">
              <text fg="#00f5ff">{SPINNER[spinnerFrame]}</text>
              <text fg="#f8f8f2" marginLeft={1}>
                Saving custom provider...
              </text>
            </box>
          </>
        )}

        {step === "result" && result && (
          <>
            <text
              alignSelf="center"
              attributes={createTextAttributes({ bold: true })}
              fg={result.success ? "#00ff99" : "#fb7185"}
            >
              {result.success ? "Success!" : "Failed"}
            </text>

            <box marginTop={2}>
              <text fg="#f8f8f2" alignSelf="center">
                {result.message}
              </text>
            </box>

            <box marginTop={2}>
              <text fg="#6c6c7c" alignSelf="center" attributes={createTextAttributes({ dim: true })}>
                Enter/Esc Close
              </text>
            </box>
          </>
        )}
      </box>
    </box>
  );
}
