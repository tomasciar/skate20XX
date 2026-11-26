/** Read the previous edition's save until the player writes a value under the new name. */
export function readGameValue(storage: Pick<Storage, 'getItem'>, key: string) {
  return storage.getItem(key) ?? storage.getItem(key.replace('20XX', '5'));
}
