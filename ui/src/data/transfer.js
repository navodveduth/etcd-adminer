export function encodeKey(key) {
  return btoa(
    Array.from(new TextEncoder().encode(key), (byte) => String.fromCharCode(byte)).join(''),
  );
}

export function parseTransfer(text) {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error('Files must be at most 2 MiB. Import one exported page at a time.');
  const file = JSON.parse(text);
  if (
    file.version !== 1 ||
    !Array.isArray(file.records) ||
    file.records.length < 1 ||
    file.records.length > 50
  )
    throw new Error('Expected version 1 with 1–50 records.');
  const seen = new Set();
  return file.records.map((record) => {
    if (typeof record.keyBase64 !== 'string' || typeof record.valueBase64 !== 'string')
      throw new Error('Each record needs base64 key and value strings.');
    let key, value;
    try {
      key = atob(record.keyBase64);
      value = atob(record.valueBase64);
    } catch {
      throw new Error('Invalid base64 key or value.');
    }
    if (!key.length || key.length > 8192 || value.length > 128 * 1024 || seen.has(key))
      throw new Error('Keys must be unique (1–8192 bytes); values must be at most 128 KiB.');
    seen.add(key);
    return { keyBase64: record.keyBase64, valueBase64: record.valueBase64 };
  });
}

export function displayKey(encoded) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
  } catch {
    return `${encoded} (base64)`;
  }
}
