/**
 * SkillsMenu Component
 *
 * A modal dialog that displays available skills grouped by source,
 * with search filtering and detailed skill information.
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { TextareaRenderable } from "@opentui/core";
import type { SkillCommand, SkillSource } from "./types.js";

interface SkillsMenuProps {
  isActive: boolean;
  onClose: () => void;
  skills: SkillCommand[];
  onInvokeSkill?: (skill: SkillCommand, args: string) => void;
}

interface SkillGroup {
  source: SkillSource;
  label: string;
  skills: SkillCommand[];
}

const SOURCE_LABELS: Record<SkillSource, string> = {
  userSettings: "User Skills",
  projectSettings: "Project Skills",
  policySettings: "Policy Skills",
  plugin: "Plugin Skills",
  bundled: "Built-in Skills",
  mcp: "MCP Skills",
};

/**
 * SkillsMenu component
 */
export function SkillsMenu({ isActive, onClose, skills, onInvokeSkill }: SkillsMenuProps) {
  const { width, height } = useTerminalDimensions();
  const inputRef = useRef<TextareaRenderable>(null);
  const [filterText, setFilterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const scrollOffsetRef = useRef(0);

  const panelWidth = Math.min(80, Math.max(50, Math.floor(width * 0.8)));
  // Base panel height without details, account for input(1) + separator(1) + padding(2) = 4
  const basePanelHeight = Math.min(height - 4, 25);
  const inputHeight = 1;
  const separatorHeight = 1;
  const listHeight = basePanelHeight - inputHeight - separatorHeight - 2;
  // When details panel is shown, expand panel height
  const panelHeight = showDetails ? Math.min(basePanelHeight + 10, height - 2) : basePanelHeight;

  // Group skills by source
  const skillGroups = useMemo<SkillGroup[]>(() => {
    const groups: Map<SkillSource, SkillCommand[]> = new Map();

    for (const skill of skills) {
      const existing = groups.get(skill.source) ?? [];
      existing.push(skill);
      groups.set(skill.source, existing);
    }

    return Array.from(groups.entries())
      .filter(([_, groupSkills]) => groupSkills.length > 0)
      .map(([source, groupSkills]) => ({
        source,
        label: SOURCE_LABELS[source] ?? source,
        skills: groupSkills,
      }));
  }, [skills]);

  // Flatten skills with filtering
  const { flatItems, totalSkills } = useMemo(() => {
    const query = filterText.toLowerCase().trim();
    
    const filteredGroups = skillGroups
      .map((group) => ({
        ...group,
        skills: group.skills.filter(
          (skill) =>
            !query ||
            skill.name.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query) ||
            skill.whenToUse?.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.skills.length > 0);

    const items: Array<{ type: "header" | "skill"; group?: SkillGroup; skill?: SkillCommand }> = [];
    for (const group of filteredGroups) {
      items.push({ type: "header", group });
      for (const skill of group.skills) {
        items.push({ type: "skill", group, skill });
      }
    }

    const total = skills.length;
    return { flatItems: items, totalSkills: total };
  }, [skillGroups, filterText, skills.length]);

  // Reset when opened
  useLayoutEffect(() => {
    if (isActive) {
      setFilterText("");
      setSelectedIndex(0);
      setShowDetails(false);
      scrollOffsetRef.current = 0;
      const ta = inputRef.current;
      if (ta) {
        ta.editBuffer.replaceText("");
        ta.focus();
      }
    }
  }, [isActive]);

  // Get selected skill
  const selectedItem = flatItems[selectedIndex];
  const selectedSkill = selectedItem?.type === "skill" ? selectedItem.skill : null;

  // Keyboard handling
  useKeyboard((key) => {
    if (!isActive) return;

    if (key.ctrl && key.name === "p") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
      return;
    }

    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
      return;
    }

    if (key.name === "up" || key.name === "down") {
      key.preventDefault();
      key.stopPropagation();

      const newIndex = key.name === "up"
        ? Math.max(0, selectedIndex - 1)
        : Math.min(flatItems.length - 1, selectedIndex + 1);

      const newItem = flatItems[newIndex];
      // Skip headers when navigating
      if (newItem?.type === "header") {
        setSelectedIndex(key.name === "up" ? Math.max(0, newIndex - 1) : Math.min(flatItems.length - 1, newIndex + 1));
      } else {
        setSelectedIndex(newIndex);
      }

      // Scroll handling
      const currentScroll = scrollOffsetRef.current;
      const newFlatIndex = flatItems.findIndex((item, idx) => idx === newIndex && item.type === "skill");
      if (newFlatIndex !== -1) {
        if (newFlatIndex < currentScroll) {
          scrollOffsetRef.current = newFlatIndex;
        } else if (newFlatIndex > currentScroll + listHeight - 1) {
          scrollOffsetRef.current = newFlatIndex - listHeight + 1;
        }
      }
      return;
    }

    if (key.name === "tab") {
      key.preventDefault();
      key.stopPropagation();
      setShowDetails((prev) => !prev);
      return;
    }

    if (key.name === "right") {
      key.preventDefault();
      key.stopPropagation();
      if (selectedSkill) {
        setShowDetails(true);
      }
      return;
    }
  });

  const handleContentChange = () => {
    const text = inputRef.current?.editBuffer.getText() ?? "";
    setFilterText(text);
    setSelectedIndex(0);
    scrollOffsetRef.current = 0;
  };

  if (!isActive) return null;

  const effectiveScrollOffset = scrollOffsetRef.current;
  const visibleItems = flatItems.slice(effectiveScrollOffset, effectiveScrollOffset + listHeight);

  // Render details panel
  const renderDetails = () => {
    if (!showDetails || !selectedSkill) return null;

    const details = [
      selectedSkill.description && `Description: ${selectedSkill.description}`,
      selectedSkill.whenToUse && `When to use: ${selectedSkill.whenToUse}`,
      selectedSkill.argumentHint && `Arguments: ${selectedSkill.argumentHint}`,
      selectedSkill.allowedTools.length > 0 && `Allowed tools: ${selectedSkill.allowedTools.join(", ")}`,
      selectedSkill.context && `Context: ${selectedSkill.context}`,
    ].filter(Boolean);

    return (
      <box height={10} flexDirection="column" marginTop={1}>
        <box height={1}>
          <text fg="#6272a4">
            {"─".repeat(panelWidth - 4)}
          </text>
        </box>
        {details.map((line, idx) => (
          <box key={idx} height={1}>
            <text fg="#8be9fd" wrapMode="none">{line}</text>
          </box>
        ))}
      </box>
    );
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
        width={panelWidth}
        height={panelHeight}
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#6272a4"
        backgroundColor="#282a36"
        paddingX={1}
        paddingY={1}
      >
        {/* Header */}
        <box height={1} flexDirection="row" justifyContent="space-between">
          <text fg="#ff79c6" attributes={createTextAttributes({ bold: true })}>
            Skills ({totalSkills})
          </text>
          <text fg="#6272a4">
            ↑↓ navigate · Tab details · Esc close
          </text>
        </box>

        {/* Filter input */}
        <box height={inputHeight} marginTop={1}>
          <text fg="#6272a4">Filter: </text>
          <textarea
            ref={inputRef}
            initialValue=""
            focused={isActive}
            showCursor
            height={1}
            wrapMode="none"
            width={panelWidth - 10}
            textColor="#f8f8f2"
            backgroundColor="#44475a"
            onContentChange={handleContentChange}
          />
        </box>

        {/* Separator */}
        <box height={separatorHeight} marginTop={1}>
          <text fg="#6272a4">
            {"─".repeat(panelWidth - 2)}
          </text>
        </box>

        {/* Skill list */}
        <box height={listHeight} flexDirection="column" overflow="hidden">
          {visibleItems.map((item, idx) => {
            const flatIndex = effectiveScrollOffset + idx;

            if (item.type === "header") {
              return (
                <box key={`h-${item.group?.source}-${flatIndex}`} height={1}>
                  <text
                    fg="#bd93f9"
                    attributes={createTextAttributes({ bold: true })}
                  >
                    {item.group?.label}
                  </text>
                </box>
              );
            }

            if (item.type === "skill" && item.skill) {
              const isSelected = flatIndex === selectedIndex;
              const safeDescription = (item.skill.description ?? "").slice(0, 50);
              return (
                <box
                  key={`s-${item.skill.name}-${flatIndex}`}
                  height={1}
                  backgroundColor={isSelected ? "#44475a" : undefined}
                  paddingLeft={2}
                  flexDirection="row"
                >
                  <text fg="#ffb86c">{item.skill.name}</text>
                  <text fg="#6272a4">  {safeDescription}{item.skill.description && item.skill.description.length > 50 ? "..." : ""}</text>
                </box>
              );
            }

            return null;
          })}
          {flatItems.length === 0 && (
            <box height={listHeight} alignItems="center" justifyContent="center">
              <text fg="#6272a4">No skills found</text>
            </box>
          )}
        </box>

        {/* Details panel */}
        {renderDetails()}
      </box>
    </box>
  );
}

/**
 * SkillsMenuStandalone - A standalone modal version that doesn't need isActive prop
 */
export function SkillsMenuStandalone({
  skills,
  onClose,
  onInvokeSkill,
}: {
  skills: SkillCommand[];
  onClose: () => void;
  onInvokeSkill?: (skill: SkillCommand, args: string) => void;
}) {
  return (
    <SkillsMenu
      isActive={true}
      onClose={onClose}
      skills={skills}
      onInvokeSkill={onInvokeSkill}
    />
  );
}
