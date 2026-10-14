// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Read an .xlsx in Node the way the page does (zlib instead of DecompressionStream).
const fs = require("fs");
const zlib = require("zlib");
const X = require("../src/xlsx.js");
module.exports = (path) => X.read(new Uint8Array(fs.readFileSync(path)), async (d) => new Uint8Array(zlib.inflateRawSync(d)));
