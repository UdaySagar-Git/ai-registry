/** A setting's value; `null` when it is not set, so the key never depends on the value. */
type SettingValue = string | boolean | null;

/** `aireg config list`: every setting by its key. */
export type ConfigList = Record<string, SettingValue>;

/** `aireg config path`. */
export interface ConfigPath {
  path: string;
}

/** `aireg config get`, `set` and `unset`: the setting as it now stands. */
export interface ConfigSetting {
  key: string;
  value: SettingValue;
}
