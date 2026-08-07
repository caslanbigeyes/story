import type { NextApiRequest, NextApiResponse } from "next";

function floatBuffer(values: number[]) {
  const array = new Float32Array(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function padBuffer(buffer: Buffer, padByte: number) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function createProductMarkerGlb() {
  const positions = floatBuffer([
    -1, -0.6, 1, 1, -0.6, 1, 1, -0.6, -1,
    -1, -0.6, 1, 1, -0.6, -1, -1, -0.6, -1,
    0, 0.95, 0, -1, -0.6, 1, 1, -0.6, 1,
    0, 0.95, 0, 1, -0.6, 1, 1, -0.6, -1,
    0, 0.95, 0, 1, -0.6, -1, -1, -0.6, -1,
    0, 0.95, 0, -1, -0.6, -1, -1, -0.6, 1,
  ]);
  const normals = floatBuffer([
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0.55, 0.83, 0, 0.55, 0.83, 0, 0.55, 0.83,
    0.83, 0.55, 0, 0.83, 0.55, 0, 0.83, 0.55, 0,
    0, 0.55, -0.83, 0, 0.55, -0.83, 0, 0.55, -0.83,
    -0.83, 0.55, 0, -0.83, 0.55, 0, -0.83, 0.55, 0,
  ]);
  const binChunk = padBuffer(Buffer.concat([positions, normals]), 0);
  const gltf = {
    asset: { version: "2.0", generator: "15-minute-webgl-plan-api" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "API Product Marker", mesh: 0, rotation: [0, 0.785, 0] }],
    meshes: [
      {
        name: "ApiProductMesh",
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }],
      },
    ],
    materials: [
      {
        name: "API cyan PBR",
        pbrMetallicRoughness: {
          baseColorFactor: [0.0, 0.94, 1.0, 1.0],
          metallicFactor: 0.55,
          roughnessFactor: 0.28,
        },
      },
    ],
    buffers: [{ byteLength: binChunk.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: positions.length, byteLength: normals.length, target: 34962 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 12,
        type: "VEC3",
        min: [-1, -0.6, -1],
        max: [1, 0.95, 1],
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 12, type: "VEC3" },
    ],
  };

  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  return Buffer.concat([
    uint32(0x46546c67),
    uint32(2),
    uint32(totalLength),
    uint32(jsonChunk.length),
    uint32(0x4e4f534a),
    jsonChunk,
    uint32(binChunk.length),
    uint32(0x004e4942),
    binChunk,
  ]);
}

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const glb = createProductMarkerGlb();
  res.setHeader("Content-Type", "model/gltf-binary");
  res.setHeader("Content-Length", String(glb.length));
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(glb);
}
