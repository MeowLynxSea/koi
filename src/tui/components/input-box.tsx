/**
 * Input Box Component
 *
 * Multiline text input with prefix and horizontal borders.
 * Uses ink-multiline-input for editing logic.
 */

import React from "react";
import { Box, Text } from "ink";
import { MultilineInput } from "ink-multiline-input";

const MODE_PREFIX = "Agent > ";

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  focused?: boolean;
  width?: number;
}

export function InputBox({ value, onChange, onSubmit, focused = true, width }: InputBoxProps) {
  return (
    <Box
      width={width}
      flexDirection="column"
      borderStyle="single"
      borderTop
      borderBottom
      borderLeft={false}
      borderRight={false}
      borderColor="gray"
      paddingX={1}
    >
      <Box flexDirection="row">
        <Box marginRight={1} flexShrink={0}>
          <Text color="#ff79c6" bold>
            {MODE_PREFIX}
          </Text>
        </Box>
        <Box flexGrow={1}>
          <MultilineInput
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            focus={focused}
            rows={3}
            maxRows={3}
            showCursor
            keyBindings={{
              submit: (key) => key.return && !key.shift,
              newline: (key) => key.return && key.shift,
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
