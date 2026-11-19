import { Box, Text } from "ink";
import type React from "react";

interface FileListProps {
  files: string[];
}

export const FileList: React.FC<FileListProps> = ({ files }) => {
  if (files.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {files.map((file) => (
        <Text key={file} color="green">
          ✓ <Text color="cyan">{file}</Text>
        </Text>
      ))}
    </Box>
  );
};
