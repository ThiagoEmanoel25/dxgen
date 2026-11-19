export interface GenerateAnswers {
  outputDir: string;
  sync: boolean;
  /** Undefined when the output directory did not exist, so nothing can be lost. */
  overwrite?: boolean;
  feature: "readme" | "diagram" | "summary";
  style: string;
}
