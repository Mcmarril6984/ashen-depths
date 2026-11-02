// Asset paths resolve normally, unless the page carries embedded copies (the single-file standalone build,
// see tools/build_standalone.py): then images come back as data: URLs and models as inline JSON text.
export function assetUrl(path) {
  return globalThis.AD_EMBED?.url?.(path) ?? path;
}
export function embeddedText(path) {
  return globalThis.AD_EMBED?.text?.(path) ?? null;
}
