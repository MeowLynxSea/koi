/**
 * Confirm Modal
 *
 * Generic confirmation dialog with customizable title, message, and buttons.
 */

import React, { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";

interface ConfirmModalProps {
  isActive: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function Button({
  label,
  fgColor,
  bgColor,
  hoverBgColor,
  isActive,
  onClick,
}: {
  label: string;
  fgColor: string;
  bgColor: string;
  hoverBgColor: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const currentBg = hover ? hoverBgColor : bgColor;

  const handleMouseUp = (e: MouseEvent) => {
    if (isActive) {
      e.stopPropagation();
      onClick();
    }
  };

  const handleMouseOver = () => {
    if (isActive) setHover(true);
  };

  const handleMouseOut = () => {
    if (isActive) setHover(false);
  };

  return (
    <box
      paddingX={1}
      backgroundColor={currentBg}
      onMouseUp={handleMouseUp}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text fg={fgColor} attributes={createTextAttributes({ bold: true })}>
        {label}
      </text>
    </box>
  );
}

export function ConfirmModal({
  isActive,
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "y" || key.name === "return") {
      onConfirm();
    } else if (key.name === "n" || key.name === "escape") {
      onCancel();
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
    >
      <box
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        alignItems="center"
      >
        <text attributes={createTextAttributes({ bold: true })} fg="#fb7185">
          {title}
        </text>
        <text>{message}</text>
        <box marginTop={1} flexDirection="row" gap={2}>
          <Button
            label={` ${confirmLabel} `}
            fgColor="white"
            bgColor="#f43f5e"
            hoverBgColor="#fb7185"
            isActive={isActive}
            onClick={onConfirm}
          />
          <Button
            label={` ${cancelLabel} `}
            fgColor="white"
            bgColor="#2dd4bf"
            hoverBgColor="#5eead4"
            isActive={isActive}
            onClick={onCancel}
          />
        </box>
      </box>
    </box>
  );
}
