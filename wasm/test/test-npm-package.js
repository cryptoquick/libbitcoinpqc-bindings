#!/usr/bin/env node

/**
 * Node.js test script for Bitcoin PQC WASM module (High-Level API)
 * 
 * Usage: node test-npm-package.js
 * 
 * This script tests the high-level TypeScript wrapper API (index.js) from the
 * command line, which provides a cleaner interface than the low-level API.
 */

const path = require('path');
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

// Load the high-level WASM module
let bitcoinpqc;
let Algorithm;

try {
    const module = require('./../dist/index.js');
    bitcoinpqc = module.bitcoinpqc || module.default;
    Algorithm = module.Algorithm;

    if (!bitcoinpqc || !Algorithm) {
        throw new Error('Failed to import bitcoinpqc or Algorithm from index.js');
    }
} catch (error) {
    console.error('Failed to load WASM module:', error);
    console.error('Make sure you have built the WASM module and TypeScript files first:');
    console.error('  cd wasm && npm run build');
    process.exit(1);
}

// PQC E2E messages (aligned with Node.js / Python bindings)
const PQC_TEST_MESSAGE = 'Hello, Bitcoin PQC!';
const PQC_TAMPERED_MESSAGE = 'Bad message!';

// Helper function to generate random bytes
function generateRandomBytes(length) {
    const array = new Uint8Array(length);
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(length);
    array.set(randomBytes);
    return array;
}

function keygenEntropySize(algorithm) {
    return algorithm === Algorithm.SECP256K1_SCHNORR ? 32 : 128;
}

function testMessageForAlgorithm(algorithm) {
    if (algorithm === Algorithm.SECP256K1_SCHNORR) {
        return SECP256K1_BIP340_ROW0_MESSAGE;
    }
    return Buffer.from(PQC_TEST_MESSAGE, 'utf8');
}

function tamperedMessageForAlgorithm(algorithm, message) {
    if (algorithm === Algorithm.SECP256K1_SCHNORR) {
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

async function testSecpBip340Row0GoldenVector() {
    console.log('\nTesting SECP256K1_SCHNORR BIP-340 row 0 golden vector:');
    console.log('--------------------------------------------------------');

    try {
        const keypair = bitcoinpqc.generateKeypair(
            Algorithm.SECP256K1_SCHNORR,
            SECP256K1_BIP340_ROW0_SECRET
        );

        if (!bytesEqual(keypair.publicKey, SECP256K1_BIP340_ROW0_EXPECTED_PK)) {
            console.log('ERROR: Public key does not match BIP-340 row 0');
            return false;
        }

        if (!bytesEqual(keypair.secretKey, SECP256K1_BIP340_ROW0_SECRET)) {
            console.log('ERROR: Secret key does not match BIP-340 row 0');
            return false;
        }

        const message = new Uint8Array(SECP256K1_BIP340_ROW0_MESSAGE);
        const signature = bitcoinpqc.sign(
            keypair.secretKey,
            message,
            Algorithm.SECP256K1_SCHNORR
        );

        if (signature.size !== bitcoinpqc.signatureSize(Algorithm.SECP256K1_SCHNORR)) {
            console.log('ERROR: Unexpected signature size for BIP-340 row 0');
            return false;
        }

        const sigBytes = signature.bytes || signature;
        if (!bytesEqual(sigBytes, SECP256K1_BIP340_ROW0_EXPECTED_SIG)) {
            console.log('ERROR: Signature does not match BIP-340 row 0 golden vector');
            return false;
        }

        const verified = bitcoinpqc.verify(
            keypair.publicKey,
            message,
            signature,
            Algorithm.SECP256K1_SCHNORR
        );

        if (!verified) {
            console.log('ERROR: BIP-340 row 0 signature verification failed');
            return false;
        }

        const tampered = Buffer.from(SECP256K1_BIP340_ROW0_MESSAGE);
        tampered[31] ^= 0x01;
        const tamperedVerified = bitcoinpqc.verify(
            keypair.publicKey,
            new Uint8Array(tampered),
            signature,
            Algorithm.SECP256K1_SCHNORR
        );

        if (tamperedVerified) {
            console.log('ERROR: Tampered BIP-340 message incorrectly verified');
            return false;
        }

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
        const keypair = bitcoinpqc.generateKeypair(
            Algorithm.ML_DSA_44,
            ML_DSA_44_TEST_ENTROPY
        );

        if (!bytesEqual(keypair.publicKey, ML_DSA_44_EXPECTED_PK)) {
            console.log('ERROR: ML-DSA-44 public key does not match golden vector');
            return false;
        }

        const message = new TextEncoder().encode(ML_DSA_44_TEST_MESSAGE);
        const signature = bitcoinpqc.sign(
            keypair.secretKey,
            message,
            Algorithm.ML_DSA_44
        );

        const sigBytes = signature.bytes || signature;
        if (!bytesEqual(sigBytes, ML_DSA_44_EXPECTED_SIG)) {
            console.log('ERROR: ML-DSA-44 signature does not match golden vector');
            return false;
        }

        const verified = bitcoinpqc.verify(
            keypair.publicKey,
            message,
            signature,
            Algorithm.ML_DSA_44
        );

        if (!verified) {
            console.log('ERROR: ML-DSA-44 golden signature verification failed');
            return false;
        }

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
        const keypair = bitcoinpqc.generateKeypair(
            Algorithm.SLH_DSA_SHA2_128S,
            SLH_DSA_SHA2_TEST_ENTROPY
        );

        if (!bytesEqual(keypair.publicKey, SLH_DSA_SHA2_EXPECTED_PK)) {
            console.log('ERROR: Public key does not match golden vector');
            return false;
        }

        const message = new TextEncoder().encode(SLH_DSA_SHA2_TEST_MESSAGE);
        const signature = bitcoinpqc.sign(
            keypair.secretKey,
            message,
            Algorithm.SLH_DSA_SHA2_128S
        );

        if (!bytesEqual(signature.bytes || signature, SLH_DSA_SHA2_EXPECTED_SIG)) {
            const sigBytes = signature.bytes || signature;
            console.log('ERROR: Signature does not match golden vector');
            console.log(`Expected ${SLH_DSA_SHA2_EXPECTED_SIG.length} bytes, got ${sigBytes.length}`);
            return false;
        }

        const verified = bitcoinpqc.verify(
            keypair.publicKey,
            message,
            signature,
            Algorithm.SLH_DSA_SHA2_128S
        );

        if (!verified) {
            console.log('ERROR: Golden signature verification failed');
            return false;
        }

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
        // Get key and signature sizes
        const pkSize = bitcoinpqc.publicKeySize(algorithm);
        const skSize = bitcoinpqc.secretKeySize(algorithm);
        const sigSize = bitcoinpqc.signatureSize(algorithm);

        console.log(`Public key size: ${pkSize} bytes`);
        console.log(`Secret key size: ${skSize} bytes`);
        console.log(`Signature size: ${sigSize} bytes`);

        // Generate random data for key generation (32 bytes secp, 128 bytes PQC)
        const randomData = generateRandomBytes(keygenEntropySize(algorithm));

        // Generate a key pair
        const keygenStart = Date.now();
        const keypair = bitcoinpqc.generateKeypair(algorithm, randomData);
        const keygenDuration = Date.now() - keygenStart;
        console.log(`Key generation time: ${keygenDuration} ms`);

        // Create a message to sign (32-byte hash semantics for secp)
        const message = testMessageForAlgorithm(algorithm);
        const messageUint8 = new Uint8Array(message);
        if (algorithm === Algorithm.SECP256K1_SCHNORR) {
            console.log('Message to sign: BIP-340 row 0 (32 zero bytes)');
        } else {
            console.log(`Message to sign: "${message.toString('utf8')}"`);
        }
        console.log(`Message length: ${message.length} bytes`);

        // Sign the message
        const signStart = Date.now();
        let signature;
        try {
            signature = bitcoinpqc.sign(keypair.secretKey, messageUint8, algorithm);
            const signDuration = Date.now() - signStart;
            console.log(`Signing time: ${signDuration} ms`);
            console.log(`Actual signature size: ${signature.size} bytes`);
        } catch (error) {
            const signDuration = Date.now() - signStart;
            console.log(`Signing failed after ${signDuration} ms`);
            console.log(`Error: ${error.message}`);
            throw error;
        }

        // Verify the signature
        const verifyStart = Date.now();
        const verifyResult = bitcoinpqc.verify(
            keypair.publicKey,
            messageUint8,
            signature,
            algorithm
        );
        const verifyDuration = Date.now() - verifyStart;

        if (verifyResult) {
            console.log('Signature verified successfully!');
        } else {
            console.log('ERROR: Signature verification failed!');
        }
        console.log(`Verification time: ${verifyDuration} ms`);

        // Try to verify with a tampered message
        const modifiedMessage = tamperedMessageForAlgorithm(algorithm, message);
        const modifiedMessageUint8 = new Uint8Array(modifiedMessage);
        if (algorithm === Algorithm.SECP256K1_SCHNORR) {
            console.log('Tampered message: BIP-340 row 0 with byte 31 flipped');
        } else {
            console.log(`Modified message: "${modifiedMessage.toString('utf8')}"`);
        }
        const modifiedVerifyResult = bitcoinpqc.verify(
            keypair.publicKey,
            modifiedMessageUint8,
            signature,
            algorithm
        );

        if (modifiedVerifyResult) {
            console.log('ERROR: Signature verified for modified message!');
            return false;
        }
        console.log('Correctly rejected signature for modified message');

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
    console.log('Bitcoin PQC Library Example (Node.js - High-Level API)');
    console.log('======================================================\n');
    console.log('This example tests the signature algorithms defined for P2MR (BIP 360).');
    console.log('Using the high-level TypeScript wrapper API (index.js).\n');

    // Initialize the module
    try {
        console.log('Initializing WASM module...');
        await bitcoinpqc.init({
            onRuntimeInitialized: () => {
                console.log('✓ WASM module initialized successfully!\n');
            },
            print: (text) => {
                // Enable WASM print output for debugging
                console.log('WASM:', text);
            },
            printErr: (text) => {
                console.error('WASM Error:', text);
            },
            // Node.js-specific: provide crypto.getRandomValues
            getRandomValues: (arr) => {
                const crypto = require('crypto');
                const randomBytes = crypto.randomBytes(arr.length);
                arr.set(randomBytes);
                return arr;
            }
        });
    } catch (error) {
        console.error('Failed to initialize module:', error);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }

    const e2eResults = [];

    // E2E: all three algorithms (keygen → sign → verify → tampered fails)
    e2eResults.push(await testAlgorithm(Algorithm.SECP256K1_SCHNORR, 'SECP256K1_SCHNORR'));
    e2eResults.push(await testAlgorithm(Algorithm.ML_DSA_44, 'ML-DSA-44'));
    e2eResults.push(await testAlgorithm(Algorithm.SLH_DSA_SHA2_128S, 'SLH-DSA-SHA2-128s'));

    const e2ePassed = e2eResults.filter(Boolean).length;
    const e2eTotal = e2eResults.length;

    // Golden-vector regressions (extra; do not replace E2E)
    const secpGoldenPassed = await testSecpBip340Row0GoldenVector();
    const mlGoldenPassed = await testMlDsa44GoldenVectors();
    const slhGoldenPassed = await testSlhDsaSha2GoldenVectors();

    // Summary
    console.log('\n======================================================');
    console.log('Test Summary:');
    console.log(`  E2E algorithms: ${e2ePassed}/${e2eTotal} passed`);
    console.log(`  SECP256K1_SCHNORR: ${e2eResults[0] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  ML-DSA-44: ${e2eResults[1] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SLH-DSA-SHA2-128s: ${e2eResults[2] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SECP256K1_SCHNORR BIP-340 row 0: ${secpGoldenPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  ML-DSA-44 golden: ${mlGoldenPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SLH-DSA-SHA2-128s golden: ${slhGoldenPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('======================================================\n');

    const exitCode =
        e2ePassed === e2eTotal &&
        secpGoldenPassed &&
        mlGoldenPassed &&
        slhGoldenPassed
            ? 0
            : 1;
    process.exit(exitCode);
}

// Start
runTests();
