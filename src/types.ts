export enum RunAt {
  START = 0,
  END,
  IDLE,
}

export interface ExecOptions {
  /**
   * Indicates whether a record needs to be generated when the operation is executed
   */
  silent?: boolean;
  /**
   * Whether the meta key is pressed
   */
  metaKey?: boolean;
  /**
   * ID of the next automation to be executed
   */
  next?: number;

  value?: string;

  /**
   * Name of event to be emitted
   */
  emit?: string;

  /**
   * @private index in group
   */
  index?: number;

  /**
   * @private mode of action runtime
   */
  mode?: ActionRunMode;

  /**
   * @private backup of scope
   */
  scope?: string;

  [prop: string]: any;
}

export type ActionRunMode = "single" | "group";
