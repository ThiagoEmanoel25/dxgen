import { type BoxProps, Box as InkBox } from "ink";
import type React from "react";

export const Box: React.FC<BoxProps> = (props) => {
  return <InkBox {...props} />;
};
