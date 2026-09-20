# SPD Die Research — KF556C40-16 sample pair

Generated for Watch X phase: DRAM 颗粒数据库识别框架.  
Artifacts: `helpers/spd-helper/spd-analysis.json`, local dumps in `raw-cache/`.

## Sample

| DIMM | Address | Serial (SPD) | Part Number |
|------|---------|--------------|-------------|
| 0 | 0x50 | 6222A3C6 | KF556C40-16 |
| 1 | 0x51 | 0C32A39F | KF556C40-16 |

Both: DDR5, 1024 B, SPD rev 1.2, DRAM mfr Samsung (JEP-106 `0xCE`), Rank 1R.

## 1. Byte difference analysis

Only **3 / 1024** bytes differ. All three are inside the JEDEC **module serial number** field (bytes 517–520).

| Offset | Role | DIMM0 | DIMM1 |
|--------|------|-------|-------|
| 517–520 | Module Serial Number (JESD400-5) | `6222A3C6` | `0C32A39F` |

Everything else — base timings, organization, manufacturing location/date, part number, DRAM ID, DRAM stepping, XMP, EXPO region — is **byte-identical**.

Implication: these two sticks are the same manufacturing batch/variant for identification purposes; serial alone distinguishes them. No SPD “die fingerprint” differs between the pair.

## 2. Region classification

| Range | Classification | Notes |
|-------|----------------|-------|
| 0–127 | JEDEC | Base config / DRAM params (JESD400-5) |
| 128–191 | jedec-or-reserved | Not interpreted beyond known keys |
| 192–255 | JEDEC module | UDIMM params; byte 234 = organization/ranks |
| 256–511 | JEDEC reserved | Present zeros / unused in this image |
| 512–554 | JEDEC manufacturing | Mfr ID, location, date, serial, PN, module rev, DRAM ID, **DRAM stepping** |
| 555–639 | **unknown** | No field map applied; do not invent |
| 640–831 | Vendor Intel XMP | Magic `0x0C4A`; profiles |
| 832–959 | Vendor EXPO/other | No `EXPO` magic on this sample |
| 960–1023 | **unknown** | Not interpreted |

“Manufacturer-specific” in the JEDEC manufacturing block means **location code (514)** is a vendor-defined code — not a free-form proprietary die blob. Bytes **555–639** remain **unknown** without a citable map.

## 3. Die-relevant JEDEC fields (this sample)

| Field | Offset | Value | Die usefulness |
|-------|--------|-------|----------------|
| DRAM Manufacturer ID | 552–553 | `0xCE` Samsung | Confirms vendor only |
| DRAM Stepping | 554 | `0x00` both | Present but **unmapped** — no Samsung DDR5 stepping→marketing-die table in DB |
| Module Revision | 551 | `0` both | Module rev key, not die name |
| Manufacturing location | 514 | `4` both | Kingston-defined; meaning unknown |
| Date (BCD) | 515–516 | year `0x26` week `0x03` | Batch hint only |

**Conclusion:** SPD proves Samsung DRAM. SPD does **not** prove A/B/D/M-die for this sample.

## 4. Kingston official PN decoder

Source: [Kingston Memory Part Number Decoder](https://www.kingston.com/en/memory/memory-part-number-decoder).

### FURY DDR5 (`KF*`) — applicable

From `KF556C40-16` (loose / truncated form also seen in SPD):

| Field | Value | Source class |
|-------|-------|--------------|
| Product line | Kingston FURY | vendor-part-number-decoder |
| Technology | DDR5 | vendor-part-number-decoder |
| Marketed speed | **5600** MT/s | vendor-part-number-decoder |
| Module type | UDIMM (`C`) | vendor-part-number-decoder |
| CAS | CL40 | vendor-part-number-decoder |
| Capacity | 16 GB | vendor-part-number-decoder |
| DRAM manufacturer in PN | **not encoded** | — |
| DRAM die in PN | **not encoded** | — |

Full retail SKU is often `KF556C40BB-16` (Beast / Black). SPD stores shortened `KF556C40-16`.

### Must NOT apply to FURY

Server Premier (`KSM*`) and Design-In (`CBD*`) encode:

- DRAM manufacturer letter (H/M/S…)
- DRAM die revision letter (A/B/D/M…)

**These letter rules are product-line specific.** Applying them to `KF556C40-16` is forbidden.

ValueRAM (`KVR*`) also does not provide a FURY-compatible die letter for this SKU.

## 5. SPD vs PN speed conflict (priority demo)

| Source | Speed claim |
|--------|-------------|
| Kingston FURY PN | Marketed DDR5-**5600** |
| SPD XMP (measured image) | Advertised DDR5-**5200** CL40 @ 1.25 V |
| SPD JEDEC | DDR5-**4800** CL38-38-38-77 |

Watch X UI keeps **SPD profiles** as SPD. PN marketed speed is shown only as documentation evidence and **must not overwrite** SPD.

## 6. Framework decision for this sample

| Claim | Result |
|-------|--------|
| Kingston / KF556C40-16 / DDR5 / 16GB / Samsung / 1R / SPD 1.2 / JEDEC+XMP | **Confirmed** (SPD ± SMBIOS ± FURY decoder for marketed attributes) |
| Samsung Die Revision (A/B/D/M-die) | **`unknown` / null** — insufficient evidence |

Database entry `kingston-kf556c40-16-variant-obs-2026-09-20` records the observed fingerprint with `identification.die = null` and `confidence = unknown`, and allows future additional variants under the same PN.
