import { customType } from "drizzle-orm/pg-core";

export const vector = customType<{
  data: number[];
  config: { dimensions: number };
}>({
  dataType(config) {
    if (!config?.dimensions) {
      throw new Error("Vector dimensions must be specified");
    }
    return `vector(${config.dimensions})`;
  },
  toDriver(value: number[]): number[] {
    return value;
  },
  fromDriver(value: unknown): number[] {
    if (!Array.isArray(value)) {
      throw new Error("Expected array for vector value");
    }
    return value;
  },
});