import { Box } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import type { ProgressState, Stage } from "../types/progress.types";
import { initializeStages } from "../utils/stage.utils";
import { GenerateView } from "./GenerateView";

interface GenerateAppProps {
  onProgressInit: (callbacks: {
    updateStage: (stageId: string, updates: Partial<Stage>) => void;
    addGeneratedFile: (filePath: string) => void;
    completeGeneration: () => void;
  }) => void;
  onError: (callback: (error: string) => void) => void;
}

export const GenerateApp: React.FC<GenerateAppProps> = ({
  onProgressInit,
  onError,
}) => {
  const [progressState, setProgressState] = useState<ProgressState>({
    stages: initializeStages(),
    currentStageIndex: 0,
    startTime: Date.now(),
    generatedFiles: [],
  });
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    onProgressInit({
      updateStage: (stageId: string, updates: Partial<Stage>) => {
        setProgressState((prev) => {
          const newStages = prev.stages.map((stage) => {
            if (stage.id !== stageId) {
              return stage;
            }
            // Stamped here so a stage that runs for minutes can show how long
            // it has been running, instead of a spinner that looks hung.
            const started =
              updates.status === "in_progress" ? Date.now() : stage.startTime;
            const ended =
              updates.status === "completed" || updates.status === "failed"
                ? Date.now()
                : stage.endTime;
            return { ...stage, startTime: started, endTime: ended, ...updates };
          });
          return {
            ...prev,
            stages: newStages,
          };
        });
      },
      addGeneratedFile: (filePath: string) => {
        setProgressState((prev) => ({
          ...prev,
          generatedFiles: [...prev.generatedFiles, filePath],
        }));
      },
      completeGeneration: () => {
        setProgressState((prev) => ({
          ...prev,
          endTime: Date.now(),
        }));
      },
    });
    onError(setError);
  }, [onProgressInit, onError]);

  const isComplete = progressState.endTime !== undefined;

  return (
    <Box>
      <GenerateView
        progressState={progressState}
        error={error}
        isComplete={isComplete}
      />
    </Box>
  );
};
