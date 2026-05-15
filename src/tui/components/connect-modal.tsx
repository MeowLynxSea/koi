/**
 * Connect Provider Modal
 *
 * Multi-step flow: provider selection → existing config view / auth input →
 * verification (animated) → result.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { TextareaRenderable, MouseEvent } from "@opentui/core";
import {
  getAllProviders,
  configureProvider,
  removeProvider,
  isProviderConfigured,
  getProviderConfig,
  validateProviderCredential,
  getConfiguredCustomProviders,
  isCustomProvider,
  removeCustomProvider,
  getCustomProviderConfig,
  type ProviderConfig,
} from "../../config/settings.js";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";
import { CustomProviderModal } from "./custom-provider-modal.js";

interface ConnectModalProps {
  isActive: boolean;
  onClose: () => void;
}

type Step = "provider" | "existing" | "auth" | "verify" | "result";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function maskCredential(cred: string): string {
  if (cred.length <= 8) return "•".repeat(cred.length);
  return cred.slice(0, 4) + "•".repeat(cred.length - 8) + cred.slice(-4);
}

export function ConnectModal({ isActive, onClose }: ConnectModalProps) {
  const { height } = useTerminalDimensions();
  const [step, setStep] = useState<Step>("provider");
  const [providers] = useState(() => getAllProviders());
  const [customProviders, setCustomProviders] = useState(() => getConfiguredCustomProviders());
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [authInput, setAuthInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const inputRef = useRef<TextareaRenderable>(null);
  const searchRef = useRef<TextareaRenderable>(null);

  // Memoize layout calculations
  const layout = useMemo(() => ({
    listHeight: Math.min(10, Math.max(3, Math.floor(height * 0.35))),
  }), [height]);

  // Filter providers based on search text
  const query = filterText;
  const filteredProviders = useMemo(() => {
    // Combine built-in and custom providers
    const allProviders = [...providers, ...customProviders];
    if (!query) return allProviders;
    const q = query.toLowerCase();
    return allProviders.filter((p) => p.toLowerCase().includes(q));
  }, [providers, customProviders, query]);

  const handleSearchChange = () => {
    const text = searchRef.current?.editBuffer.getText() ?? "";
    setFilterText(text);
    setSelectedProviderIndex(0);
    setScrollOffset(0);
  };

  // Reset when opened
  useEffect(() => {
    if (isActive) {
      setStep("provider");
      setSelectedProviderIndex(0);
      setSelectedProvider(null);
      setAuthInput("");
      setVerifyResult(null);
      setSpinnerFrame(0);
      setScrollOffset(0);
      setFilterText("");
      const ta = searchRef.current;
      if (ta) {
        ta.editBuffer.replaceText("");
        ta.focus();
      }
    }
  }, [isActive]);

  // Refresh when modal becomes active or custom modal closes
  useEffect(() => {
    if (isActive) {
      setCustomProviders(getConfiguredCustomProviders());
    }
  }, [isActive, showCustomModal]);

  // Focus input on auth step
  useEffect(() => {
    if (isActive && step === "auth") {
      setTimeout(() => {
        const ta = inputRef.current;
        if (ta) {
          ta.editBuffer.replaceText("");
          ta.focus();
        }
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

  // Real verification
  useEffect(() => {
    if (!isActive || step !== "verify") return;

    let cancelled = false;

    void (async () => {
      try {
        const result = await validateProviderCredential(
          selectedProvider!,
          authInput.trim()
        );
        if (cancelled) return;

        const config: ProviderConfig = {
          provider: selectedProvider!,
          authMethod: getOAuthProvider(selectedProvider!) ? "oauth" : "apikey",
          credential: authInput.trim(),
        };

        setVerifyResult({
          success: result.valid,
          message: result.valid
            ? `Connected to ${selectedProvider}!`
            : `Failed to connect to ${selectedProvider}: ${result.error}`,
        });

        if (result.valid && selectedProvider) {
          configureProvider(config);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setVerifyResult({
          success: false,
          message: `Failed to connect to ${selectedProvider}: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        if (!cancelled) {
          setStep("result");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, step, authInput, selectedProvider]);

  // Auto-scroll provider list
  useEffect(() => {
    if (selectedProviderIndex < scrollOffset) {
      setScrollOffset(selectedProviderIndex);
    } else if (selectedProviderIndex >= scrollOffset + layout.listHeight) {
      setScrollOffset(selectedProviderIndex - layout.listHeight + 1);
    }
  }, [selectedProviderIndex, layout.listHeight, scrollOffset]);

  // Reset selected index when filter changes
  useEffect(() => {
    if (selectedProviderIndex >= filteredProviders.length && filteredProviders.length > 0) {
      setSelectedProviderIndex(filteredProviders.length - 1);
    }
  }, [filteredProviders.length, selectedProviderIndex]);

  const handleSelectProvider = (provider: string) => {
    setSelectedProvider(provider);
    // Custom providers are always considered "configured" - show existing
    if (isProviderConfigured(provider) || isCustomProvider(provider)) {
      setStep("existing");
    } else {
      setStep("auth");
    }
  };

  const handleClearConfig = () => {
    if (selectedProvider) {
      if (isCustomProvider(selectedProvider)) {
        removeCustomProvider(selectedProvider);
        setCustomProviders(getConfiguredCustomProviders());
      } else {
        removeProvider(selectedProvider);
      }
    }
    setStep("provider");
    setSelectedProvider(null);
  };

  const handleOverwrite = () => {
    setStep("auth");
    setAuthInput("");
  };

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "escape") {
      if (step === "provider" || step === "result") {
        onClose();
      } else if (step === "existing") {
        setStep("provider");
        setSelectedProvider(null);
      } else {
        setStep("provider");
        setSelectedProvider(null);
        setAuthInput("");
      }
      return;
    }
    if (step === "provider") {
      if (key.name === "up") {
        setSelectedProviderIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.name === "down") {
        setSelectedProviderIndex((prev) => Math.max(0, Math.min(filteredProviders.length - 1, prev + 1)));
        return;
      }
      if (key.name === "return") {
        const provider = filteredProviders[selectedProviderIndex];
        if (provider) {
          handleSelectProvider(provider);
        }
        return;
      }
      // Ctrl+N to add custom provider
      if ((key.ctrl || key.meta) && key.name === "n") {
        setShowCustomModal(true);
        return;
      }
    }
    if (step === "existing") {
      if (key.name === "o" || key.name === "O") {
        handleOverwrite();
        return;
      }
      if (key.name === "c" || key.name === "C") {
        handleClearConfig();
        return;
      }
      if (key.name === "return" || key.name === "l" || key.name === "L") {
        setStep("provider");
        setSelectedProvider(null);
        return;
      }
    }
    if (step === "auth") {
      if (key.name === "return") {
        if (authInput.trim()) {
          setStep("verify");
        }
        return;
      }
    }
    if (step === "result") {
      if (key.name === "return") {
        onClose();
        return;
      }
    }
  });

  const handleAuthChange = () => {
    const text = inputRef.current?.editBuffer.getText() ?? "";
    setAuthInput(text);
  };

  const isOAuthProvider = (p?: string | null) => (p ? !!getOAuthProvider(p) : false);

  const existingConfig = selectedProvider ? getProviderConfig(selectedProvider) : undefined;

  if (!isActive) return null;

  const visibleProviders = filteredProviders.slice(scrollOffset, scrollOffset + layout.listHeight);

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
    >
      <box
        width={60}
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
      >
        {step === "provider" && (
          <>
            <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
              Select Provider
            </text>

            {/* Filter input */}
            <box height={1} marginTop={1} backgroundColor="#16213e" paddingX={1}>
              <textarea
                ref={searchRef}
                initialValue=""
                focused={isActive}
                showCursor
                height={1}
                wrapMode="none"
                textColor="#f8f8f2"
                backgroundColor="#16213e"
                onContentChange={handleSearchChange}
              />
            </box>

            {/* Separator */}
            <box height={1} marginTop={1}>
              <text fg="#4a4a5a">
                {"─".repeat(56)}
              </text>
            </box>

            <box height={layout.listHeight} flexDirection="column" overflow="hidden" marginTop={1}>
              {filteredProviders.length === 0 && (
                <box height={1}>
                  <text fg="#6c6c7c">
                    No providers match "{filterText}"
                  </text>
                </box>
              )}
              {visibleProviders.map((p, i) => {
                const actualIndex = scrollOffset + i;
                const configured = isProviderConfigured(p);
                const isCustom = isCustomProvider(p);
                const indicator = isCustom ? "◆" : configured ? "●" : "  ";
                const color = actualIndex === selectedProviderIndex
                  ? (isCustom ? "#bd93f9" : "#ff79c6")
                  : "#f8f8f2";
                return (
                  <box
                    key={p}
                    height={1}
                    backgroundColor={actualIndex === selectedProviderIndex ? "#44475a" : undefined}
                    paddingLeft={1}
                    flexDirection="row"
                    onMouseUp={(e: MouseEvent) => {
                      e.stopPropagation();
                      handleSelectProvider(p);
                    }}
                  >
                    <text fg={color}>
                      {indicator}{" "}{p}
                    </text>
                    {configured && !isCustom && (
                      <text fg="#00ff99" marginLeft={1}>
                        configured
                      </text>
                    )}
                    {isCustom && (
                      <text fg="#bd93f9" marginLeft={1}>
                        custom
                      </text>
                    )}
                  </box>
                );
              })}
            </box>

            {/* Add Custom button */}
            <box
              height={1}
              marginTop={1}
              backgroundColor="#16213e"
              paddingX={1}
              flexDirection="row"
              justifyContent="center"
              onMouseUp={(e: MouseEvent) => {
                e.stopPropagation();
                setShowCustomModal(true);
              }}
            >
              <text fg="#bd93f9" attributes={createTextAttributes({ bold: true })}>
                + Add Custom Provider
              </text>
            </box>

            <box marginTop={1}>
              <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                ↑↓ Navigate  Enter Select  Esc Cancel  Type to search  Ctrl+N Add Custom
              </text>
            </box>
          </>
        )}

        {step === "existing" && existingConfig && (
          <>
            <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
              {selectedProvider} — Already Configured
            </text>
            <box marginTop={1}>
              <text fg="#6c6c7c">
                Auth method: {existingConfig.authMethod.toUpperCase()}
              </text>
            </box>
            <box marginTop={1}>
              <text fg="#f8f8f2">
                {existingConfig.authMethod === "apikey"
                  ? `API Key: ${maskCredential(existingConfig.credential)}`
                  : `OAuth token: ${maskCredential(existingConfig.credential)}`}
              </text>
            </box>
            <box marginTop={1} flexDirection="row" gap={2}>
              <box
                paddingX={2}
                backgroundColor="#2dd4bf"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  handleOverwrite();
                }}
              >
                <text attributes={createTextAttributes({ bold: true })} fg="white">
                  Overwrite (O)
                </text>
              </box>
              <box
                paddingX={2}
                backgroundColor="#f43f5e"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  handleClearConfig();
                }}
              >
                <text attributes={createTextAttributes({ bold: true })} fg="white">
                  Clear (C)
                </text>
              </box>
              <box
                paddingX={2}
                backgroundColor="#6272a4"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  setStep("provider");
                  setSelectedProvider(null);
                }}
              >
                <text attributes={createTextAttributes({ bold: true })} fg="white">
                  Leave (L)
                </text>
              </box>
            </box>
            <box marginTop={1}>
              <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                O Overwrite  C Clear  L Leave  Esc Back
              </text>
            </box>
          </>
        )}

        {step === "existing" && selectedProvider && isCustomProvider(selectedProvider) && (() => {
            const config = getCustomProviderConfig(selectedProvider);
            if (!config) return null;
            return (
            <>
            <text attributes={createTextAttributes({ bold: true })} fg="#bd93f9">
              {selectedProvider} ◆ Custom Provider
            </text>
            <box marginTop={1}>
              <text fg="#6c6c7c">
                Format: {(config.apiFormat ?? "unknown").replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </text>
            </box>
            <box marginTop={1}>
              <text fg="#6c6c7c">
                BaseURL: {config.baseUrl}
              </text>
            </box>
            <box marginTop={1}>
              <text fg="#6c6c7c">
                Models: {config.modelIds.join(", ")}
              </text>
            </box>
            <box marginTop={1}>
              <text fg="#f8f8f2">
                API Key: {maskCredential(config.credential ?? "")}
              </text>
            </box>
            <box marginTop={1} flexDirection="row" gap={2}>
              <box
                paddingX={2}
                backgroundColor="#f43f5e"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  handleClearConfig();
                }}
              >
                <text attributes={createTextAttributes({ bold: true })} fg="white">
                  Remove (R)
                </text>
              </box>
              <box
                paddingX={2}
                backgroundColor="#6272a4"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  setStep("provider");
                  setSelectedProvider(null);
                }}
              >
                <text attributes={createTextAttributes({ bold: true })} fg="white">
                  Back (L)
                </text>
              </box>
            </box>
            <box marginTop={1}>
              <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                R Remove  L Leave  Esc Back
              </text>
            </box>
          </>
          );
        })()}

        {step === "auth" && (
          <>
            <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
              Authenticate: {selectedProvider}
            </text>
            <box marginTop={1}>
              <text fg="#6c6c7c">
                {isOAuthProvider(selectedProvider)
                  ? "This provider requires OAuth. Authenticate in your browser and paste the token."
                  : "Enter your API key or credentials for this provider."}
              </text>
            </box>
            <box marginTop={1} height={1} backgroundColor="#16213e" paddingX={1}>
              <textarea
                ref={inputRef}
                initialValue=""
                focused={isActive}
                showCursor
                height={1}
                wrapMode="none"
                textColor="#f8f8f2"
                backgroundColor="#16213e"
                onContentChange={handleAuthChange}
              />
            </box>
            <box marginTop={1}>
              <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                Enter Confirm  Esc Back
              </text>
            </box>
          </>
        )}

        {step === "verify" && (
          <>
            <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
              Verifying
            </text>
            <box marginTop={1} flexDirection="row" alignItems="center">
              <text fg="#00f5ff">{SPINNER[spinnerFrame]}</text>
              <text fg="#f8f8f2" marginLeft={1}>
                Connecting to {selectedProvider}...
              </text>
            </box>
          </>
        )}

        {step === "result" && verifyResult && (
          <>
            <text
              attributes={createTextAttributes({ bold: true })}
              fg={verifyResult.success ? "#00ff99" : "#fb7185"}
            >
              {verifyResult.success ? "Success" : "Failed"}
            </text>
            <box marginTop={1}>
              <text fg="#f8f8f2">{verifyResult.message}</text>
            </box>
            <box marginTop={1}>
              <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                Enter/Esc Close
              </text>
            </box>
          </>
        )}
      </box>

      {/* Custom Provider Modal */}
      <CustomProviderModal
        isActive={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onSuccess={() => {
          setShowCustomModal(false);
          setCustomProviders(getConfiguredCustomProviders());
        }}
      />
    </box>
  );
}
