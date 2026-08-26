import { HttpParams, HttpRequest } from '@angular/common/http';
import { StateKey, makeStateKey } from '@angular/core';

// Length-prefix each atom (netstring style) so no field, parameter key, or
// parameter value can be crafted to shift another's boundary. Without this a
// hash over delimiter-joined fields still collides on ambiguous inputs, e.g.
// `?tag=x&tag=y` and `?tag=x,y` both serialize to `tag=x,y`.
function encodeAtom(value: string): string {
  return `${value.length}:${value}`;
}

function sortAndConcatParams(params: HttpParams | URLSearchParams): string {
  const keys = [...new Set(params.keys())].sort();
  const atoms: string[] = [];
  for (const key of keys) {
    for (const value of params.getAll(key) ?? []) {
      atoms.push(encodeAtom(key), encodeAtom(value));
    }
  }
  return atoms.join('');
}

export function makeCacheKey(
  request: HttpRequest<any>,
  mappedRequestUrl: string,
): StateKey<unknown> {
  const { params, method, responseType } = request;
  const encodedParams = sortAndConcatParams(params);

  let serializedBody = request.serializeBody();
  if (serializedBody instanceof URLSearchParams) {
    serializedBody = sortAndConcatParams(serializedBody);
  } else if (typeof serializedBody !== 'string') {
    serializedBody = '';
  }

  const key = [
    method,
    responseType,
    mappedRequestUrl,
    serializedBody,
    encodedParams,
  ]
    .map(encodeAtom)
    .join('');

  const hash = generateHash(key);

  return makeStateKey(hash);
}

/**
 * SHA-256 round constants (first 32 bits of the fractional parts of the cube
 * roots of the first 64 primes).
 */
const SHA256_ROUND_CONSTANTS = /* @__PURE__ */ new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

let textEncoder: TextEncoder | undefined;

/**
 * Generates a SHA-256 hash of a string. This mirrors Angular's `HttpTransferCache`
 * key derivation: a synchronous SHA-256 is used because the Web Crypto API is
 * asynchronous, whereas cache-key derivation in the interceptor must stay
 * synchronous. The previous 32-bit DJB2 hash had a keyspace small enough for an
 * attacker to craft colliding requests and poison the transfer cache.
 */
function generateHash(value: string): string {
  textEncoder ??= new TextEncoder();
  const inputBytes = textEncoder.encode(value);

  // Initial hash values (first 32 bits of the fractional parts of the square
  // roots of the first 8 primes).
  let hashState0 = 0x6a09e667;
  let hashState1 = 0xbb67ae85;
  let hashState2 = 0x3c6ef372;
  let hashState3 = 0xa54ff53a;
  let hashState4 = 0x510e527f;
  let hashState5 = 0x9b05688c;
  let hashState6 = 0x1f83d9ab;
  let hashState7 = 0x5be0cd19;

  const messageLengthInBits = inputBytes.length * 8;
  const paddedLengthInBytes = (((inputBytes.length + 8) >> 6) + 1) << 6;
  const paddedBytes = new Uint8Array(paddedLengthInBytes);
  paddedBytes.set(inputBytes);
  paddedBytes[inputBytes.length] = 0x80;

  const paddedBytesView = new DataView(paddedBytes.buffer);
  const lowBits = messageLengthInBits >>> 0;
  const highBits = (messageLengthInBits / 0x100000000) >>> 0;
  paddedBytesView.setUint32(paddedLengthInBytes - 8, highBits, false);
  paddedBytesView.setUint32(paddedLengthInBytes - 4, lowBits, false);

  const messageSchedule = new Uint32Array(64);
  for (
    let chunkOffset = 0;
    chunkOffset < paddedLengthInBytes;
    chunkOffset += 64
  ) {
    for (let i = 0; i < 16; i++) {
      messageSchedule[i] = paddedBytesView.getUint32(
        chunkOffset + i * 4,
        false,
      );
    }

    for (let i = 16; i < 64; i++) {
      const prevWord15 = messageSchedule[i - 15];
      const sigma0 =
        (((prevWord15 >>> 7) | (prevWord15 << 25)) ^
          ((prevWord15 >>> 18) | (prevWord15 << 14)) ^
          (prevWord15 >>> 3)) >>>
        0;

      const prevWord2 = messageSchedule[i - 2];
      const sigma1 =
        (((prevWord2 >>> 17) | (prevWord2 << 15)) ^
          ((prevWord2 >>> 19) | (prevWord2 << 13)) ^
          (prevWord2 >>> 10)) >>>
        0;

      messageSchedule[i] =
        (messageSchedule[i - 16] + sigma0 + messageSchedule[i - 7] + sigma1) >>>
        0;
    }

    let workingStateA = hashState0;
    let workingStateB = hashState1;
    let workingStateC = hashState2;
    let workingStateD = hashState3;
    let workingStateE = hashState4;
    let workingStateF = hashState5;
    let workingStateG = hashState6;
    let workingStateH = hashState7;

    for (let i = 0; i < 64; i++) {
      const capitalSigma1 =
        (((workingStateE >>> 6) | (workingStateE << 26)) ^
          ((workingStateE >>> 11) | (workingStateE << 21)) ^
          ((workingStateE >>> 25) | (workingStateE << 7))) >>>
        0;
      const chFunction =
        ((workingStateE & workingStateF) ^ (~workingStateE & workingStateG)) >>>
        0;
      const temp1 =
        (workingStateH +
          capitalSigma1 +
          chFunction +
          SHA256_ROUND_CONSTANTS[i] +
          messageSchedule[i]) >>>
        0;

      const capitalSigma0 =
        (((workingStateA >>> 2) | (workingStateA << 30)) ^
          ((workingStateA >>> 13) | (workingStateA << 19)) ^
          ((workingStateA >>> 22) | (workingStateA << 10))) >>>
        0;
      const majFunction =
        ((workingStateA & workingStateB) ^
          (workingStateA & workingStateC) ^
          (workingStateB & workingStateC)) >>>
        0;
      const temp2 = (capitalSigma0 + majFunction) >>> 0;

      workingStateH = workingStateG;
      workingStateG = workingStateF;
      workingStateF = workingStateE;
      workingStateE = (workingStateD + temp1) >>> 0;
      workingStateD = workingStateC;
      workingStateC = workingStateB;
      workingStateB = workingStateA;
      workingStateA = (temp1 + temp2) >>> 0;
    }

    hashState0 = (hashState0 + workingStateA) >>> 0;
    hashState1 = (hashState1 + workingStateB) >>> 0;
    hashState2 = (hashState2 + workingStateC) >>> 0;
    hashState3 = (hashState3 + workingStateD) >>> 0;
    hashState4 = (hashState4 + workingStateE) >>> 0;
    hashState5 = (hashState5 + workingStateF) >>> 0;
    hashState6 = (hashState6 + workingStateG) >>> 0;
    hashState7 = (hashState7 + workingStateH) >>> 0;
  }

  return [
    hashState0,
    hashState1,
    hashState2,
    hashState3,
    hashState4,
    hashState5,
    hashState6,
    hashState7,
  ]
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}
