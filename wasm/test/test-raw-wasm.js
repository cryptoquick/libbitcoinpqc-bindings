#!/usr/bin/env node

/**
 * Node.js test script for Bitcoin PQC WASM module
 * 
 * Usage: node test-node.js
 * 
 * This script tests the WASM module from the command line, which is useful
 * for debugging without browser overhead.
 */

const {
    ML_DSA_44_EXPECTED_PK,
    ML_DSA_44_EXPECTED_SIG,
    ML_DSA_44_TEST_ENTROPY,
    ML_DSA_44_TEST_MESSAGE,
} = require('./ml_dsa_44_golden_vectors');
const {
    SECP256K1_BIP340_ROW0_EXPECTED_PK,
    SECP256K1_BIP340_ROW0_EXPECTED_SIG,
    SECP256K1_BIP340_ROW0_MESSAGE,
    SECP256K1_BIP340_ROW0_SECRET,
} = require('./secp256k1_bip340_golden_vectors');
const {
    SLH_DSA_SHA2_EXPECTED_PK,
    SLH_DSA_SHA2_EXPECTED_SIG,
    SLH_DSA_SHA2_TEST_ENTROPY,
    SLH_DSA_SHA2_TEST_MESSAGE,
} = require('./slh_dsa_sha2_golden_vectors');

// Load the WASM module using require (Emscripten generates CommonJS-compatible code)
let Module;
let moduleFactory;

try {
    moduleFactory = require('./../dist/bitcoinpqc.js');
} catch (error) {
    console.error('Failed to load WASM module:', error);
    console.error('Make sure you have built the WASM module first:');
    console.error('  cd wasm && npm run build');
    process.exit(1);
}

// Configuration for Node.js environment
// Will be set in initModule() after functions are defined
let moduleConfig;

// Helper functions (must be defined after Module is available)
function readUint32(ptr) {
    if (Module.HEAP32) {
        return (Module.HEAP32[ptr >> 2] >>> 0);
    }
    const heap = Module.HEAP8;
    return (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0;
}

function readPointer(ptr) {
    return readUint32(ptr);
}

function getKeySizes(algorithm) {
    const pkSize = Module.ccall('bitcoin_pqc_public_key_size', 'number', ['number'], [algorithm]);
    const skSize = Module.ccall('bitcoin_pqc_secret_key_size', 'number', ['number'], [algorithm]);
    const sigSize = Module.ccall('bitcoin_pqc_signature_size', 'number', ['number'], [algorithm]);
    return { pkSize, skSize, sigSize };
}

// PQC E2E messages (aligned with Node.js / Python bindings)
const PQC_TEST_MESSAGE = 'Hello, Bitcoin PQC!';
const PQC_TAMPERED_MESSAGE = 'Bad message!';

function generateRandomBytes(length) {
    const array = new Uint8Array(length);
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(length);
    array.set(randomBytes);
    return array;
}

function keygenEntropySize(algorithm) {
    return algorithm === 0 ? 32 : 128;
}

function testMessageForAlgorithm(algorithm) {
    if (algorithm === 0) {
        return Buffer.from(SECP256K1_BIP340_ROW0_MESSAGE);
    }
    return Buffer.from(PQC_TEST_MESSAGE, 'utf8');
}

function tamperedMessageForAlgorithm(algorithm, message) {
    if (algorithm === 0) {
        const tampered = Buffer.from(message);
        tampered[31] ^= 0x01;
        return tampered;
    }
    return Buffer.from(PQC_TAMPERED_MESSAGE, 'utf8');
}

function bytesEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function generateKeypair(algorithm, randomData) {
    const randomPtr = Module._malloc(randomData.length);
    Module.HEAP8.set(randomData, randomPtr);

    const keypairPtr = Module._malloc(32);

    const result = Module.ccall(
        'bitcoin_pqc_keygen',
        'number',
        ['number', 'number', 'number', 'number'],
        [algorithm, keypairPtr, randomPtr, randomData.length]
    );

    Module._free(randomPtr);

    if (result !== 0) {
        Module._free(keypairPtr);
        throw new Error('Key generation failed with error code: ' + result);
    }

    const publicKeyPtr = readPointer(keypairPtr + 4);
    const secretKeyPtr = readPointer(keypairPtr + 8);
    const publicKeySize = readUint32(keypairPtr + 12);
    const secretKeySize = readUint32(keypairPtr + 16);

    const publicKey = Module.HEAP8.subarray(publicKeyPtr, publicKeyPtr + publicKeySize);
    const secretKey = Module.HEAP8.subarray(secretKeyPtr, secretKeyPtr + secretKeySize);

    const publicKeyCopy = new Uint8Array(publicKey);
    const secretKeyCopy = new Uint8Array(secretKey);

    return {
        keypairPtr,
        publicKey: publicKeyCopy,
        secretKey: secretKeyCopy,
        publicKeySize,
        secretKeySize
    };
}

function signMessage(algorithm, secretKey, message) {
    if (!secretKey || secretKey.length === 0) {
        throw new Error('Invalid secret key: empty or null');
    }

    const expectedSkSize = getKeySizes(algorithm).skSize;
    if (secretKey.length !== expectedSkSize) {
        throw new Error(`Secret key size mismatch: expected ${expectedSkSize}, got ${secretKey.length}`);
    }

    const secretKeyPtr = Module._malloc(secretKey.length);
    Module.HEAP8.set(secretKey, secretKeyPtr);

    const messagePtr = Module._malloc(message.length);
    Module.HEAP8.set(message, messagePtr);

    const signaturePtr = Module._malloc(16);
    Module.HEAP8.fill(0, signaturePtr, signaturePtr + 16);

    if (Module.HEAP32) {
        Module.HEAP32[signaturePtr >> 2] = algorithm;
    } else {
        Module.HEAP8[signaturePtr] = algorithm & 0xFF;
        Module.HEAP8[signaturePtr + 1] = (algorithm >> 8) & 0xFF;
        Module.HEAP8[signaturePtr + 2] = (algorithm >> 16) & 0xFF;
        Module.HEAP8[signaturePtr + 3] = (algorithm >> 24) & 0xFF;
    }

    let result;
    try {
        result = Module.ccall(
            'bitcoin_pqc_sign',
            'number',
            ['number', 'number', 'number', 'number', 'number', 'number'],
            [algorithm, secretKeyPtr, secretKey.length, messagePtr, message.length, signaturePtr]
        );
    } catch (error) {
        Module._free(secretKeyPtr);
        Module._free(messagePtr);
        Module._free(signaturePtr);
        throw new Error(`WASM error during signing: ${error.message}`);
    }

    Module._free(secretKeyPtr);
    Module._free(messagePtr);

    if (result !== 0) {
        Module._free(signaturePtr);
        const errorMsg = result === -1 ? 'BAD_ARG' : result === -2 ? 'BAD_KEY' : result === -3 ? 'BAD_SIGNATURE' : result === -4 ? 'NOT_IMPLEMENTED' : `UNKNOWN(${result})`;
        throw new Error(`Signing failed with error code: ${result} (${errorMsg})`);
    }

    const signatureDataPtr = readPointer(signaturePtr + 4);
    const signatureSize = readUint32(signaturePtr + 8);

    const signature = Module.HEAP8.subarray(signatureDataPtr, signatureDataPtr + signatureSize);
    const signatureCopy = new Uint8Array(signature);

    return {
        signaturePtr,
        signature: signatureCopy,
        signatureSize
    };
}

function verifySignature(algorithm, publicKey, message, signature) {
    const publicKeyPtr = Module._malloc(publicKey.length);
    Module.HEAP8.set(publicKey, publicKeyPtr);

    const messagePtr = Module._malloc(message.length);
    Module.HEAP8.set(message, messagePtr);

    const signaturePtr = Module._malloc(signature.length);
    Module.HEAP8.set(signature, signaturePtr);

    const result = Module.ccall(
        'bitcoin_pqc_verify',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [algorithm, publicKeyPtr, publicKey.length, messagePtr, message.length, signaturePtr, signature.length]
    );

    Module._free(publicKeyPtr);
    Module._free(messagePtr);
    Module._free(signaturePtr);

    return result === 0;
}

async function testSecpBip340Row0GoldenVector() {
    console.log('\nTesting SECP256K1_SCHNORR BIP-340 row 0 golden vector:');
    console.log('--------------------------------------------------------');

    try {
        const keypair = generateKeypair(0, SECP256K1_BIP340_ROW0_SECRET);

        if (!bytesEqual(keypair.publicKey, SECP256K1_BIP340_ROW0_EXPECTED_PK)) {
            console.log('ERROR: Public key does not match BIP-340 row 0');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            return false;
        }

        if (!bytesEqual(keypair.secretKey, SECP256K1_BIP340_ROW0_SECRET)) {
            console.log('ERROR: Secret key does not match BIP-340 row 0');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            return false;
        }

        const message = Buffer.from(SECP256K1_BIP340_ROW0_MESSAGE);
        const signatureData = signMessage(0, keypair.secretKey, message);

        if (!bytesEqual(signatureData.signature, SECP256K1_BIP340_ROW0_EXPECTED_SIG)) {
            console.log('ERROR: Signature does not match BIP-340 row 0 golden vector');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }

        const verified = verifySignature(
            0,
            keypair.publicKey,
            message,
            signatureData.signature
        );

        if (!verified) {
            console.log('ERROR: BIP-340 row 0 signature verification failed');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }

        const tampered = Buffer.from(message);
        tampered[31] ^= 0x01;
        const tamperedVerified = verifySignature(
            0,
            keypair.publicKey,
            tampered,
            signatureData.signature
        );

        if (tamperedVerified) {
            console.log('ERROR: Tampered BIP-340 message incorrectly verified');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }

        Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
        Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);

        console.log('✓ BIP-340 row 0 golden vector passed!\n');
        return true;
    } catch (error) {
        console.error(`❌ BIP-340 golden vector test failed: ${error.message}`);
        return false;
    }
}

async function testMlDsa44GoldenVectors() {
    console.log('\nTesting ML-DSA-44 golden vectors:');
    console.log('-----------------------------------');

    try {
        const keypair = generateKeypair(1, ML_DSA_44_TEST_ENTROPY);

        if (!bytesEqual(keypair.publicKey, ML_DSA_44_EXPECTED_PK)) {
            console.log('ERROR: ML-DSA-44 public key does not match golden vector');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            return false;
        }

        const message = Buffer.from(ML_DSA_44_TEST_MESSAGE, 'utf8');
        const signatureData = signMessage(1, keypair.secretKey, message);

        if (!bytesEqual(signatureData.signature, ML_DSA_44_EXPECTED_SIG)) {
            console.log('ERROR: ML-DSA-44 signature does not match golden vector');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }

        const verified = verifySignature(
            1,
            keypair.publicKey,
            message,
            signatureData.signature
        );

        if (!verified) {
            console.log('ERROR: ML-DSA-44 golden signature verification failed');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }

        Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
        Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);

        console.log('✓ ML-DSA-44 golden vectors passed!\n');
        return true;
    } catch (error) {
        console.error(`❌ ML-DSA-44 golden vector test failed: ${error.message}`);
        return false;
    }
}

async function testSlhDsaSha2GoldenVectors() {
    console.log('\nTesting SLH-DSA-SHA2-128s golden vectors:');
    console.log('-------------------------------------------');

    try {
        const keypair = generateKeypair(2, SLH_DSA_SHA2_TEST_ENTROPY);

        if (!bytesEqual(keypair.publicKey, SLH_DSA_SHA2_EXPECTED_PK)) {
            console.log('ERROR: Public key does not match golden vector');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            return false;
        }

        const message = Buffer.from(SLH_DSA_SHA2_TEST_MESSAGE, 'utf8');
        const signatureData = signMessage(2, keypair.secretKey, message);

        if (!bytesEqual(signatureData.signature, SLH_DSA_SHA2_EXPECTED_SIG)) {
            console.log('ERROR: Signature does not match golden vector');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }

        const verified = verifySignature(
            2,
            keypair.publicKey,
            message,
            signatureData.signature
        );

        if (!verified) {
            console.log('ERROR: Golden signature verification failed');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }

        Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
        Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);

        console.log('✓ Golden vectors passed!\n');
        return true;
    } catch (error) {
        console.error(`❌ Golden vector test failed: ${error.message}`);
        return false;
    }
}

// Test function
async function testAlgorithm(algorithm, name) {
    console.log(`\nTesting ${name} algorithm:`);
    console.log('------------------------');

    try {
        const { pkSize, skSize, sigSize } = getKeySizes(algorithm);
        console.log(`Public key size: ${pkSize} bytes`);
        console.log(`Secret key size: ${skSize} bytes`);
        console.log(`Signature size: ${sigSize} bytes`);

        const randomData = generateRandomBytes(keygenEntropySize(algorithm));

        const keygenStart = Date.now();
        const keypair = generateKeypair(algorithm, randomData);
        const keygenDuration = Date.now() - keygenStart;
        console.log(`Key generation time: ${keygenDuration} ms`);

        const message = testMessageForAlgorithm(algorithm);
        if (algorithm === 0) {
            console.log('Message to sign: BIP-340 row 0 (32 zero bytes)');
        } else {
            console.log(`Message to sign: "${message.toString('utf8')}"`);
        }
        console.log(`Message length: ${message.length} bytes`);

        const signStart = Date.now();
        let signatureData;
        try {
            signatureData = signMessage(algorithm, keypair.secretKey, message);
            const signDuration = Date.now() - signStart;
            console.log(`Signing time: ${signDuration} ms`);
            console.log(`Actual signature size: ${signatureData.signatureSize} bytes`);
        } catch (error) {
            const signDuration = Date.now() - signStart;
            console.log(`Signing failed after ${signDuration} ms`);
            console.log(`Error: ${error.message}`);
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            throw error;
        }

        const verifyStart = Date.now();
        const verifyResult = verifySignature(
            algorithm,
            keypair.publicKey,
            message,
            signatureData.signature
        );
        const verifyDuration = Date.now() - verifyStart;

        if (verifyResult) {
            console.log('Signature verified successfully!');
        } else {
            console.log('ERROR: Signature verification failed!');
        }
        console.log(`Verification time: ${verifyDuration} ms`);

        const modifiedMessage = tamperedMessageForAlgorithm(algorithm, message);
        if (algorithm === 0) {
            console.log('Tampered message: BIP-340 row 0 with byte 31 flipped');
        } else {
            console.log(`Modified message: "${modifiedMessage.toString('utf8')}"`);
        }
        const modifiedVerifyResult = verifySignature(
            algorithm,
            keypair.publicKey,
            modifiedMessage,
            signatureData.signature
        );

        if (modifiedVerifyResult) {
            console.log('ERROR: Signature verified for modified message!');
            Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
            Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);
            return false;
        }
        console.log('Correctly rejected signature for modified message');

        Module.ccall('bitcoin_pqc_keypair_free', null, ['number'], [keypair.keypairPtr]);
        Module.ccall('bitcoin_pqc_signature_free', null, ['number'], [signatureData.signaturePtr]);

        if (!verifyResult) {
            console.log('ERROR: E2E failed — signature verification did not succeed');
            return false;
        }

        console.log('✓ Test passed!\n');
        return true;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        return false;
    }
}

async function runTests() {
    console.log('Bitcoin PQC Library Example (Node.js)');
    console.log('=====================================\n');
    console.log('This example tests the post-quantum signature algorithms designed for BIP-360 and the Bitcoin QuBit soft fork.\n');

    const results = [];

    // E2E: all three algorithms (keygen → sign → verify → tampered fails)
    results.push(await testAlgorithm(0, 'SECP256K1_SCHNORR'));
    results.push(await testAlgorithm(1, 'ML-DSA-44'));
    results.push(await testAlgorithm(2, 'SLH-DSA-SHA2-128s'));

    const e2ePassed = results.filter(Boolean).length;
    const e2eTotal = results.length;

    const secpGoldenPassed = await testSecpBip340Row0GoldenVector();
    const mlGoldenPassed = await testMlDsa44GoldenVectors();
    const slhGoldenPassed = await testSlhDsaSha2GoldenVectors();

    // Summary
    console.log('\n=====================================');
    console.log('Test Summary:');
    console.log(`  E2E algorithms: ${e2ePassed}/${e2eTotal} passed`);
    console.log(`  SECP256K1_SCHNORR: ${results[0] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  ML-DSA-44: ${results[1] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SLH-DSA-SHA2-128s: ${results[2] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SECP256K1_SCHNORR BIP-340 row 0: ${secpGoldenPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  ML-DSA-44 golden: ${mlGoldenPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SLH-DSA-SHA2-128s golden: ${slhGoldenPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('=====================================\n');

    const exitCode =
        e2ePassed === e2eTotal &&
        secpGoldenPassed &&
        mlGoldenPassed &&
        slhGoldenPassed
            ? 0
            : 1;
    process.exit(exitCode);
}

// Initialize the module
async function initModule() {
    try {
        // Create config - the callback will be called during initialization,
        // but we'll run tests after the promise resolves
        moduleConfig = {
            onRuntimeInitialized: function () {
                // This callback is called during initialization
                // but we'll run tests after await completes
            },
            print: function (text) {
                // Enable WASM print output for debugging
                console.log('WASM:', text);
            },
            printErr: function (text) {
                console.error('WASM Error:', text);
            },
            // Node.js-specific: provide crypto.getRandomValues
            getRandomValues: function (arr) {
                const crypto = require('crypto');
                const randomBytes = crypto.randomBytes(arr.length);
                arr.set(randomBytes);
                return arr;
            }
        };

        // Module factory returns a Promise that resolves to the Module instance
        // The onRuntimeInitialized callback will be called during this await
        Module = await moduleFactory(moduleConfig);

        // Now Module is fully initialized and available
        console.log('✓ WASM module initialized successfully!\n');
        runTests();
    } catch (error) {
        console.error('Failed to initialize module:', error);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Start
initModule();
