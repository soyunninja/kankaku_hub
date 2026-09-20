// Pure byte-level content sniffing for favicon downloads. Never trusts a
// declared Content-Type or file extension alone — this is a real magic-byte
// check. No PocketBase/goja globals; runs under both goja and plain Node.
"use strict";

// Accepted raster types and their declared-Content-Type aliases. Order
// matters only for readability; detection below is by magic bytes, not by
// this map.
var ACCEPTED_CONTENT_TYPES = {
  "image/png": "png",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Normalizes a byte source (Array<number>, Uint8Array-like, or a Node
 * Buffer) into a plain function `at(i)` returning the byte at index i (or
 * undefined past the end), plus a `length`.
 */
function toReader(bytes) {
  if (!bytes) {
    return { length: 0, at: function () { return undefined; } };
  }
  var length = bytes.length;
  return {
    length: length,
    at: function (i) {
      if (i < 0 || i >= length) {
        return undefined;
      }
      return bytes[i];
    },
  };
}

function matches(reader, offset, expectedBytes) {
  for (var i = 0; i < expectedBytes.length; i++) {
    if (reader.at(offset + i) !== expectedBytes[i]) {
      return false;
    }
  }
  return true;
}

function isPng(reader) {
  return matches(reader, 0, [0x89, 0x50, 0x4e, 0x47]);
}

function isIco(reader) {
  return matches(reader, 0, [0x00, 0x00, 0x01, 0x00]);
}

function isJpeg(reader) {
  return matches(reader, 0, [0xff, 0xd8, 0xff]);
}

function isGif(reader) {
  return matches(reader, 0, [0x47, 0x49, 0x46, 0x38]);
}

function isWebp(reader) {
  return (
    matches(reader, 0, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    matches(reader, 8, [0x57, 0x45, 0x42, 0x50]) // "WEBP"
  );
}

/**
 * Reads up to the first N bytes as ASCII (best-effort, non-printable bytes
 * become spaces) for a cheap textual sniff of SVG/HTML content that was
 * mislabeled as an image.
 */
function headAscii(reader, maxLen) {
  var out = "";
  var n = Math.min(maxLen, reader.length);
  for (var i = 0; i < n; i++) {
    var b = reader.at(i);
    out += b >= 32 && b < 127 ? String.fromCharCode(b) : " ";
  }
  return out;
}

function looksLikeSvgOrHtml(reader) {
  var head = headAscii(reader, 512).toLowerCase();
  var trimmed = head.replace(/^\s+/, "");
  return (
    trimmed.indexOf("<svg") === 0 ||
    trimmed.indexOf("<?xml") === 0 ||
    trimmed.indexOf("<!doctype") === 0 ||
    trimmed.indexOf("<html") === 0
  );
}

/**
 * Sniffs a byte buffer and returns { ok: boolean, type: string|null,
 * contentType: string|null }. `type` is one of "png"|"ico"|"jpg"|"gif"|
 * "webp" when ok, matching one of ACCEPTED_CONTENT_TYPES' values.
 *
 * Both the magic bytes AND the declared content-type are checked: the
 * declared type must be in the allow-list, AND the magic bytes must match
 * a recognized raster format. A mismatch between the two (e.g. a
 * text/html body served with an image/png header) is rejected.
 *
 * @param {Array<number>|Uint8Array|Buffer} bytes
 * @param {string} declaredContentType - the response's Content-Type header,
 *   may include a "; charset=..." suffix which is ignored.
 */
function sniffFavicon(bytes, declaredContentType) {
  var reader = toReader(bytes);

  if (looksLikeSvgOrHtml(reader)) {
    return { ok: false, type: null, contentType: null };
  }

  var detected = null;
  if (isPng(reader)) {
    detected = "png";
  } else if (isIco(reader)) {
    detected = "ico";
  } else if (isJpeg(reader)) {
    detected = "jpg";
  } else if (isGif(reader)) {
    detected = "gif";
  } else if (isWebp(reader)) {
    detected = "webp";
  }

  if (!detected) {
    return { ok: false, type: null, contentType: null };
  }

  var declared = (declaredContentType || "").split(";")[0].trim().toLowerCase();
  var declaredType = ACCEPTED_CONTENT_TYPES[declared];

  if (!declaredType) {
    // Declared header is missing/unrecognized/not in the allow-list.
    return { ok: false, type: null, contentType: null };
  }

  // ico/x-icon and vnd.microsoft.icon both map to "ico" bytes; anything
  // else must match exactly (e.g. a png header on a jpg body is rejected).
  if (declaredType !== detected) {
    return { ok: false, type: null, contentType: null };
  }

  return { ok: true, type: detected, contentType: declared };
}

module.exports = {
  sniffFavicon: sniffFavicon,
  ACCEPTED_CONTENT_TYPES: ACCEPTED_CONTENT_TYPES,
};
