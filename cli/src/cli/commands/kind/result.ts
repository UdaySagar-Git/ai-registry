/** `aireg <kind> new`: the files it created, and the fields left as TODO. */
export interface KindNew {
  kind: string;
  name: string;
  created: string[];
  todo: string[];
}

/** `aireg <kind> new --from`: each artifact copied in, at its path in the registry. */
export interface KindNewFrom {
  kind: string;
  namespace: string;
  created: { name: string; at: string }[];
}

export type KindNewResult = KindNew | KindNewFrom;

/** `aireg <kind> bump`: the version copied, and the new one. */
export interface KindBump {
  kind: string;
  name: string;
  from: string;
  to: string;
}
