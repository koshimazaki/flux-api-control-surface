const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type BflPngMetadata = {
  prompt?: Record<string, any>;
  full?: Record<string, any>;
  text: Record<string, string>;
};

const latin1Decoder = new TextDecoder("latin1");
const utf8Decoder = new TextDecoder("utf-8");

function isPng(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUInt32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readNullTerminated(bytes: Uint8Array, start: number, decoder: TextDecoder) {
  const end = bytes.indexOf(0, start);
  if (end < 0) return null;
  return {
    value: decoder.decode(bytes.subarray(start, end)),
    next: end + 1
  };
}

function readTextChunk(data: Uint8Array) {
  const keyword = readNullTerminated(data, 0, latin1Decoder);
  if (!keyword) return null;
  return {
    keyword: keyword.value,
    text: latin1Decoder.decode(data.subarray(keyword.next))
  };
}

function readInternationalTextChunk(data: Uint8Array) {
  const keyword = readNullTerminated(data, 0, latin1Decoder);
  if (!keyword || keyword.next + 2 > data.length) return null;
  const compressionFlag = data[keyword.next];
  const offsetAfterCompression = keyword.next + 2;
  const language = readNullTerminated(data, offsetAfterCompression, latin1Decoder);
  if (!language) return null;
  const translatedKeyword = readNullTerminated(data, language.next, utf8Decoder);
  if (!translatedKeyword || compressionFlag !== 0) return null;
  return {
    keyword: keyword.value,
    text: utf8Decoder.decode(data.subarray(translatedKeyword.next))
  };
}

function parseJson(text?: string) {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function extractBflPngMetadata(buffer: ArrayBuffer): BflPngMetadata {
  const bytes = new Uint8Array(buffer);
  if (!isPng(bytes)) return { text: {} };

  const text: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUInt32(bytes, offset);
    const type = latin1Decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;

    if (type === "tEXt") {
      const chunk = readTextChunk(bytes.subarray(dataStart, dataEnd));
      if (chunk) text[chunk.keyword] = chunk.text;
    }
    if (type === "iTXt") {
      const chunk = readInternationalTextChunk(bytes.subarray(dataStart, dataEnd));
      if (chunk) text[chunk.keyword] = chunk.text;
    }
    if (type === "IEND") break;
    offset = dataEnd + 4;
  }

  return {
    text,
    prompt: parseJson(text.BFLPrompt),
    full: parseJson(text.BFLMetadata)
  };
}

export async function readBflPngMetadata(file: File) {
  return extractBflPngMetadata(await file.arrayBuffer());
}
