import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import React, { useEffect, useState } from "react";
import type { Stage } from "../types/progress.types";
import { getStatusColor, getStatusSymbol } from "../utils/stage.utils";

interface ProgressStagesProps {
  stages: Stage[];
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Ticks on its own because the stage that dominates a run -- generating the
 * document -- can take minutes without emitting anything. A spinner alone
 * gives no way to tell slow from hung.
 */
const Elapsed: React.FC<{ since: number }> = ({ since }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return <Text dimColor>{` ${formatDuration(now - since)}`}</Text>;
};

export const ProgressStages: React.FC<ProgressStagesProps> = ({ stages }) => {
  return (
    <Box flexDirection="column">
      {stages.map((stage) => {
        if (stage.status === "in_progress") {
          return (
            <Box key={stage.id}>
              <Text color="cyan">
                <Spinner type="arc" /> {stage.label}
                {stage.details ? ` ${stage.details}` : "..."}
              </Text>
              {stage.startTime ? <Elapsed since={stage.startTime} /> : null}
            </Box>
          );
        }

        const took =
          stage.status === "completed" && stage.startTime && stage.endTime
            ? formatDuration(stage.endTime - stage.startTime)
            : undefined;

        return (
          <Box key={stage.id}>
            <Text color={getStatusColor(stage.status)}>
              {getStatusSymbol(stage.status)} {stage.label}
              {stage.details ? ` ${stage.details}` : ""}
              {stage.status === "pending" ? "..." : ""}
            </Text>
            {took ? <Text dimColor>{` ${took}`}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
};
