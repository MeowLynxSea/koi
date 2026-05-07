/**
 * Exit Confirmation Modal
 *
 * Displays a centered dialog asking the user to confirm exit.
 * Supports keyboard (Y/N/Esc) and mouse click.
 */

import React, { useRef, useState } from "react";
import { Box, Text, useInput, type DOMElement } from "ink";
import {
  useOnClick,
  useOnMouseEnter,
  useOnMouseLeave,
} from "@ink-tools/ink-mouse";

interface ExitModalProps {
  isActive: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function Button({
  label,
  color,
  bgColor,
  hoverBgColor,
  isActive,
  onClick,
}: {
  label: string;
  color: string;
  bgColor: string;
  hoverBgColor: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const ref = useRef<DOMElement>(null);
  const [hover, setHover] = useState(false);

  useOnClick(ref, isActive ? onClick : undefined);
  useOnMouseEnter(ref, isActive ? () => setHover(true) : undefined);
  useOnMouseLeave(ref, isActive ? () => setHover(false) : undefined);

  const currentBg = hover ? hoverBgColor : bgColor;

  return (
    <Box ref={ref} paddingX={1} backgroundColor={currentBg}>
      <Text color={color} bold>
        {label}
      </Text>
    </Box>
  );
}

export function ExitModal({ isActive, onConfirm, onCancel }: ExitModalProps) {
  useInput(
    (input, key) => {
      if (input === "y" || input === "Y") {
        onConfirm();
      } else if (input === "n" || input === "N" || key.escape) {
        onCancel();
      }
    },
    { isActive }
  );

  if (!isActive) return null;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      alignItems="center"
    >
      <Text bold color="red">
        Exit Koi?
      </Text>
      <Text>Are you sure you want to exit?</Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Button
          label=" Yes "
          color="black"
          bgColor="#22c55e"
          hoverBgColor="#4ade80"
          isActive={isActive}
          onClick={onConfirm}
        />
        <Button
          label=" No  "
          color="black"
          bgColor="#ef4444"
          hoverBgColor="#f87171"
          isActive={isActive}
          onClick={onCancel}
        />
      </Box>
    </Box>
  );
}
