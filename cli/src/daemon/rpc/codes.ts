/** JSON-RPC's own error codes, then the daemon's in its server range. */
export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  Internal: -32603,
  /** A classified failure: an adapter's, the disk's, or a daemon too busy or stopping. */
  Server: -32000,
  UnsupportedVersion: -32001,
  NotInitialized: -32002,
  /** Another writer moved the config first; resync from `data.revision`. */
  StaleRevision: -32003,
  NotFound: -32004,
  /** The job already has a run going. */
  Busy: -32005,
} as const;

export type RpcErrorCode = (typeof RpcErrorCode)[keyof typeof RpcErrorCode];
