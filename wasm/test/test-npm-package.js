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

// Helper function to generate random bytes
function generateRandomBytes(length) {
    const array = new Uint8Array(length);
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(length);
    array.set(randomBytes);
    return array;
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

        // Generate random data for key generation
        const randomData = generateRandomBytes(128);

        // Generate a key pair
        const keygenStart = Date.now();
        const keypair = bitcoinpqc.generateKeypair(algorithm, randomData);
        const keygenDuration = Date.now() - keygenStart;
        console.log(`Key generation time: ${keygenDuration} ms`);

        // Create a message to sign
        const messageText = 'This is a test message for PQC signature verification';
        const message = Buffer.from(messageText, 'utf8');
        const messageUint8 = new Uint8Array(message);
        console.log(`Message to sign: "${messageText}"`);
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

        // Try to verify with a modified message
        const modifiedMessageText = 'This is a MODIFIED message for PQC signature verification';
        const modifiedMessage = Buffer.from(modifiedMessageText, 'utf8');
        const modifiedMessageUint8 = new Uint8Array(modifiedMessage);
        console.log(`Modified message: "${modifiedMessageText}"`);
        const modifiedVerifyResult = bitcoinpqc.verify(
            keypair.publicKey,
            modifiedMessageUint8,
            signature,
            algorithm
        );

        if (modifiedVerifyResult) {
            console.log('ERROR: Signature verified for modified message!');
        } else {
            console.log('Correctly rejected signature for modified message');
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
    console.log('This example tests the post-quantum signature algorithms designed for BIP-360 and the Bitcoin QuBit soft fork.');
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

    const results = [];

    // Test ML-DSA-44
    results.push(await testAlgorithm(Algorithm.ML_DSA_44, 'ML-DSA-44'));

    // Test SLH-DSA-SHA2-128s
    results.push(await testAlgorithm(Algorithm.SLH_DSA_SHA2_128S, 'SLH-DSA-SHA2-128s'));

    // Golden-vector regression (catches SHA2/SHAKE build mismatches)
    results.push(await testSlhDsaSha2GoldenVectors());

    // Summary
    console.log('\n======================================================');
    console.log('Test Summary:');
    console.log(`  ML-DSA-44: ${results[0] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SLH-DSA-SHA2-128s: ${results[1] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  SLH-DSA-SHA2-128s golden: ${results[2] ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('======================================================\n');

    const exitCode = results.every(r => r) ? 0 : 1;
    process.exit(exitCode);
}

// Start
runTests();
