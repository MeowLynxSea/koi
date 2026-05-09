/**
 * Model Selection Modal
 *
 * Shows configured providers as section headers with their models as
 * selectable items. Uses Pi SDK model registry.
 *
 * Supports Primary / Auxiliary model selection via tab switcher
 * in the top-right corner. Press Tab to toggle between modes.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";
import {
  getConfiguredProviders,
  getCurrentModel,
  getAuxiliaryModel,
  setCurrentModel,
  setAuxiliaryModel,
  getProviderModels,
  type ModelRef,
} from "../../config/settings.js";

interface ModelModalProps {
  isActive: boolean;
  onClose: () => void;
  onSelectPrimary?: (model: ModelRef) => void;
  onSelectAuxiliary?: (model: ModelRef) => void;
}

interface FlatItem {
  type: "header" | "model";
  provider?: string;
  modelId?: string;
  modelName?: string;
  modelIndex?: number;
}

export function ModelModal({
  isActive,
  onClose,
  onSelectPrimary,
  onSelectAuxiliary,
}: ModelModalProps) {
  const { height } = useTerminalDimensions();
  const configuredProviders = getConfiguredProviders();
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"primary" | "auxiliary">("primary");
  const scrollOffsetRef = useRef(0);

  const listHeight = Math.min(12, Math.floor(height * 0.4));
  const primaryModel = getCurrentModel();
  const auxiliaryModel = getAuxiliaryModel();

  // Reset when opened
  useLayoutEffect(() => {
    if (isActive) {
      setSelectedModelIndex(0);
      setActiveTab("primary");
      scrollOffsetRef.current = 0;
    }
  }, [isActive]);

  // Build flat list of providers + models
  const { flatItems, modelCount } = useMemo(() => {
    const items: FlatItem[] = [];
    let mIdx = 0;
    for (const provider of configuredProviders) {
      items.push({ type: "header", provider });
      const models = getProviderModels(provider);
      for (const model of models) {
        items.push({
          type: "model",
          provider,
          modelId: model.id,
          modelName: model.name || model.id,
          modelIndex: mIdx,
        });
        mIdx++;
      }
    }
    return { flatItems: items, modelCount: mIdx };
  }, [configuredProviders]);

  // Clamp selected index
  useEffect(() => {
    if (selectedModelIndex >= modelCount && modelCount > 0) {
      setSelectedModelIndex(modelCount - 1);
    }
  }, [modelCount, selectedModelIndex]);

  // Effective scroll offset
  const effectiveScrollOffset = scrollOffsetRef.current;

  useKeyboard((key) => {
    if (!isActive) return;

    if (key.name === "tab" || key.name === "TAB") {
      setActiveTab((prev) => (prev === "primary" ? "auxiliary" : "primary"));
      return;
    }

    if (key.name === "escape") {
      onClose();
      return;
    }

    // Navigation with direct scroll calculation
    if (key.name === "up" || key.name === "down") {
      const newIndex = key.name === "up"
        ? Math.max(0, selectedModelIndex - 1)
        : Math.min(modelCount - 1, selectedModelIndex + 1);

      const newFlatIndex = flatItems.findIndex(
        (i) => i.type === "model" && i.modelIndex === newIndex
      );

      let newScrollOffset = scrollOffsetRef.current;
      if (newFlatIndex !== -1) {
        if (newFlatIndex < scrollOffsetRef.current) {
          newScrollOffset = newFlatIndex;
        } else if (newFlatIndex > scrollOffsetRef.current + listHeight - 1) {
          newScrollOffset = newFlatIndex - listHeight + 1;
        }
      }

      scrollOffsetRef.current = newScrollOffset;
      setSelectedModelIndex(newIndex);
      return;
    }
    if (key.name === "return") {
      const selectedItem = flatItems.find(
        (i) => i.type === "model" && i.modelIndex === selectedModelIndex
      );
      if (selectedItem?.provider && selectedItem.modelId) {
        const ref = {
          provider: selectedItem.provider,
          modelId: selectedItem.modelId,
        };
        if (activeTab === "primary") {
          setCurrentModel(ref);
          onSelectPrimary?.(ref);
        } else {
          setAuxiliaryModel(ref);
          onSelectAuxiliary?.(ref);
        }
        onClose();
      }
      return;
    }
  });

  if (!isActive) return null;

  const visibleItems = flatItems.slice(effectiveScrollOffset, effectiveScrollOffset + listHeight);

  const isCurrent = (provider?: string, modelId?: string) => {
    const target = activeTab === "primary" ? primaryModel : auxiliaryModel;
    return target?.provider === provider && target?.modelId === modelId;
  };

  const handleMouseSelect = (
    e: MouseEvent,
    provider?: string,
    modelId?: string
  ) => {
    e.stopPropagation();
    if (provider && modelId) {
      const ref = { provider, modelId };
      if (activeTab === "primary") {
        setCurrentModel(ref);
        onSelectPrimary?.(ref);
      } else {
        setAuxiliaryModel(ref);
        onSelectAuxiliary?.(ref);
      }
      onClose();
    }
  };

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
        {/* Header row with tabs */}
        <box flexDirection="row" justifyContent="space-between">
          <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
            Select Model
          </text>

          <box flexDirection="row" gap={1}>
            <box
              paddingX={1}
              backgroundColor={
                activeTab === "primary" ? "#44475a" : undefined
              }
              onMouseUp={(e: MouseEvent) => {
                e.stopPropagation();
                setActiveTab("primary");
              }}
            >
              <text
                fg={activeTab === "primary" ? "#ff79c6" : "#6c6c7c"}
                attributes={createTextAttributes({ bold: activeTab === "primary" })}
              >
                Primary
              </text>
            </box>
            <box
              paddingX={1}
              backgroundColor={
                activeTab === "auxiliary" ? "#44475a" : undefined
              }
              onMouseUp={(e: MouseEvent) => {
                e.stopPropagation();
                setActiveTab("auxiliary");
              }}
            >
              <text
                fg={activeTab === "auxiliary" ? "#ff79c6" : "#6c6c7c"}
                attributes={createTextAttributes({ bold: activeTab === "auxiliary" })}
              >
                Auxiliary
              </text>
            </box>
          </box>
        </box>

        <box
          height={listHeight}
          flexDirection="column"
          overflow="hidden"
          marginTop={1}
        >
          {configuredProviders.length === 0 && (
            <box height={1}>
              <text fg="#6c6c7c">
                No providers configured. Use /connect to add one.
              </text>
            </box>
          )}
          {visibleItems.map((item, idx) => {
            const flatIndex = effectiveScrollOffset + idx;
            if (item.type === "header") {
              return (
                <box
                  key={`h-${item.provider}-${flatIndex}`}
                  height={1}
                  marginTop={1}
                >
                  <text
                    fg="#ff79c6"
                    attributes={createTextAttributes({ bold: true })}
                  >
                    {item.provider}
                  </text>
                </box>
              );
            }
            const isSelected = item.modelIndex === selectedModelIndex;
            const current = isCurrent(item.provider, item.modelId);
            return (
              <box
                key={`m-${item.modelId}-${flatIndex}`}
                height={1}
                backgroundColor={isSelected ? "#44475a" : undefined}
                paddingLeft={2}
                flexDirection="row"
                onMouseUp={(e: MouseEvent) =>
                  handleMouseSelect(e, item.provider, item.modelId)
                }
              >
                <text fg={isSelected ? "#ff79c6" : "#f8f8f2"}>
                  {current ? "● " : "  "}
                  {item.modelName}
                </text>
              </box>
            );
          })}
        </box>

        <box marginTop={1} flexDirection="row" justifyContent="space-between">
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            ↑↓ Navigate  Enter Select  Esc Cancel
          </text>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            Tab Switch
          </text>
        </box>
      </box>
    </box>
  );
}
