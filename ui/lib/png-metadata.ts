const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: number[] | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  return crcTable;
}

function crc32(buffer: Buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createInternationalTextChunk(keyword: string, text: string) {
  const safeKeyword = keyword.replace(/[^\x20-\x7e]/g, "").slice(0, 79) || "BFLMetadata";
  return createChunk(
    "iTXt",
    Buffer.concat([
      Buffer.from(safeKeyword, "latin1"),
      Buffer.from([0, 0, 0, 0, 0]),
      Buffer.from(text, "utf8")
    ])
  );
}

function isPng(buffer: Buffer) {
  return buffer.length > 12 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

export function embedPngMetadata(buffer: Buffer, metadata: Record<string, unknown>) {
  if (!isPng(buffer)) return buffer;

  let offset = 8;
  let iendOffset = -1;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IEND") {
      iendOffset = offset;
      break;
    }
    offset += 12 + length;
  }

  if (iendOffset < 0) return buffer;

  const compact = JSON.stringify({
    prompt: metadata.payload && typeof metadata.payload === "object" ? (metadata.payload as any).prompt : undefined,
    model: metadata.model,
    endpointName: metadata.endpointName,
    seed: metadata.payload && typeof metadata.payload === "object" ? (metadata.payload as any).seed ?? null : null,
    width: metadata.payload && typeof metadata.payload === "object" ? (metadata.payload as any).width : undefined,
    height: metadata.payload && typeof metadata.payload === "object" ? (metadata.payload as any).height : undefined,
    outputFormat:
      metadata.payload && typeof metadata.payload === "object" ? (metadata.payload as any).output_format : undefined,
    requestId: metadata.id,
    sampleUrl: metadata.sampleUrl,
    runSettings: metadata.runSettings
  });
  const full = JSON.stringify(metadata);
  const chunks = Buffer.concat([
    createInternationalTextChunk("BFLPrompt", compact),
    createInternationalTextChunk("BFLMetadata", full)
  ]);

  return Buffer.concat([buffer.subarray(0, iendOffset), chunks, buffer.subarray(iendOffset)]);
}
