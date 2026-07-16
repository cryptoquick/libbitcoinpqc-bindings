{
  "targets": [
    {
      "target_name": "secp256k1",
      "type": "static_library",
      "sources": [
        "src/c_sources/secp256k1/src/secp256k1.c",
        "src/c_sources/secp256k1/src/precomputed_ecmult.c",
        "src/c_sources/secp256k1/src/precomputed_ecmult_gen.c"
      ],
      "include_dirs": [
        "src/c_sources/secp256k1",
        "src/c_sources/secp256k1/include",
        "src/c_sources/secp256k1/src"
      ],
      "cflags": [
        "-Wno-unused-function",
        "-Wno-nonnull-compare"
      ],
      "defines": [
        "ECMULT_GEN_PREC_BITS=4",
        "ECMULT_WINDOW_SIZE=15",
        "ENABLE_MODULE_SCHNORRSIG=1",
        "ENABLE_MODULE_EXTRAKEYS=1",
        "USE_NUM_NONE=1",
        "USE_FIELD_INV_BUILTIN=1",
        "USE_SCALAR_INV_BUILTIN=1",
        "USE_ENDOMORPHISM=1"
      ],
      "conditions": [
        ["target_arch=='x64' and OS!='win'", {
          "defines": [
            "HAVE___INT128=1",
            "USE_ASM_X86_64=1",
            "USE_FIELD_5X52=1",
            "USE_SCALAR_4X64=1"
          ]
        }, {
          "defines": [
            "USE_FIELD_10X26=1",
            "USE_SCALAR_8X32=1"
          ]
        }]
      ]
    },
    {
      "target_name": "bitcoinpqc",
      "dependencies": [
        "secp256k1",
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "sources": [
        "src/native/bitcoinpqc_addon.cc",
        "src/c_sources/bitcoinpqc.c",
        "src/c_sources/secp256k1_schnorr.c",
        "src/c_sources/ml_dsa/keygen.c",
        "src/c_sources/ml_dsa/sign.c",
        "src/c_sources/ml_dsa/verify.c",
        "src/c_sources/ml_dsa/utils.c",
        "src/c_sources/slh_dsa/keygen.c",
        "src/c_sources/slh_dsa/sign.c",
        "src/c_sources/slh_dsa/verify.c",
        "src/c_sources/slh_dsa/utils.c",
        "src/c_sources/dilithium_ref/sign.c",
        "src/c_sources/dilithium_ref/packing.c",
        "src/c_sources/dilithium_ref/polyvec.c",
        "src/c_sources/dilithium_ref/poly.c",
        "src/c_sources/dilithium_ref/ntt.c",
        "src/c_sources/dilithium_ref/reduce.c",
        "src/c_sources/dilithium_ref/rounding.c",
        "src/c_sources/dilithium_ref/fips202.c",
        "src/c_sources/dilithium_ref/symmetric-shake.c",
        "src/c_sources/randombytes_custom.c",
        "src/c_sources/sphincsplus_ref/address.c",
        "src/c_sources/sphincsplus_ref/fors.c",
        "src/c_sources/sphincsplus_ref/hash_sha2.c",
        "src/c_sources/sphincsplus_ref/merkle.c",
        "src/c_sources/sphincsplus_ref/sign.c",
        "src/c_sources/sphincsplus_ref/thash_sha2_simple.c",
        "src/c_sources/sphincsplus_ref/utils.c",
        "src/c_sources/sphincsplus_ref/utilsx1.c",
        "src/c_sources/sphincsplus_ref/wots.c",
        "src/c_sources/sphincsplus_ref/wotsx1.c",
        "src/c_sources/sphincsplus_ref/sha2.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src/c_sources",
        "src/c_sources/include",
        "src/c_sources/dilithium_ref",
        "src/c_sources/sphincsplus_ref",
        "src/c_sources/secp256k1/include"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "cflags": [ "-Wno-sign-compare", "-Wno-unused-variable", "-Wno-implicit-function-declaration" ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "DILITHIUM_MODE=2",
        "CRYPTO_ALGNAME=\"SPHINCS+-sha2-128s\"",
        "PARAMS=sphincs-sha2-128s",
        "CUSTOM_RANDOMBYTES=1"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
            "OTHER_CFLAGS": [
              "-Wno-sign-compare",
              "-Wno-unused-variable",
              "-Wno-implicit-function-declaration"
            ]
          }
        }],
        ["OS!='win'", {
          "libraries": [ "-lpthread" ]
        }]
      ]
    }
  ]
}