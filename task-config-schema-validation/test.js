#!/usr/bin/env node
/**
 * Test suite for Agent Config Validator
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${colors.green}✓${colors.reset} ${name}`);
    passed++;
  } catch (e) {
    console.log(`${colors.red}✗${colors.reset} ${name}: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Create test configs
const validConfig = {
  name: "test-agent",
  version: "1.0.0",
  type: "chat",
  framework: "evomap",
  models: {
    provider: "openai",
    model: "gpt-4",
    temperature: 0.7
  }
};

const invalidConfig = {
  name: "test-agent",
  // missing version
  type: "invalid-type" // invalid enum value
};

// Setup test files
const testDir = path.join(__dirname, 'test-temp');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

fs.writeFileSync(
  path.join(testDir, 'valid.agent.json'),
  JSON.stringify(validConfig, null, 2)
);

fs.writeFileSync(
  path.join(testDir, 'invalid.agent.json'),
  JSON.stringify(invalidConfig, null, 2)
);

fs.writeFileSync(
  path.join(testDir, 'valid.agent.yaml'),
  `name: "test-agent"
version: "1.0.0"
type: "chat"
framework: "evomap"
models:
  provider: "openai"
  model: "gpt-4"
  temperature: 0.7`
);

console.log('\nRunning tests...\n');

// Test 1: Schema file exists
test('Schema file exists', () => {
  assertEqual(
    fs.existsSync(path.join(__dirname, 'agent-config.schema.json')),
    true,
    'Schema file should exist'
  );
});

// Test 2: Valid JSON config
test('Valid JSON config passes validation', () => {
  const result = execSync(
    `node ${path.join(__dirname, 'validator.js')} ${path.join(testDir, 'valid.agent.json')} --format json`,
    { encoding: 'utf-8' }
  );
  const output = JSON.parse(result);
  assertEqual(output.valid, true, 'Should be valid');
  assertEqual(output.summary.errors, 0, 'Should have no errors');
});

// Test 3: Valid YAML config
test('Valid YAML config passes validation', () => {
  const result = execSync(
    `node ${path.join(__dirname, 'validator.js')} ${path.join(testDir, 'valid.agent.yaml')} --format json`,
    { encoding: 'utf-8' }
  );
  const output = JSON.parse(result);
  assertEqual(output.valid, true, 'Should be valid');
});

// Test 4: Invalid config fails validation
test('Invalid config fails validation', () => {
  try {
    execSync(
      `node ${path.join(__dirname, 'validator.js')} ${path.join(testDir, 'invalid.agent.json')} --format json`,
      { encoding: 'utf-8' }
    );
    throw new Error('Should have thrown');
  } catch (e) {
    // Expected to fail
    if (e.status === 1) {
      // Validation error exit code
      return;
    }
    throw e;
  }
});

// Test 5: Example config is valid
test('Example config is valid', () => {
  const result = execSync(
    `node ${path.join(__dirname, 'validator.js')} ${path.join(__dirname, 'agent-config.example.yaml')} --format json`,
    { encoding: 'utf-8' }
  );
  const output = JSON.parse(result);
  assertEqual(output.valid, true, 'Example should be valid');
});

// Test 6: Schema has required definitions
test('Schema has required definitions', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'agent-config.schema.json')));
  assertEqual(!!schema.definitions.modelConfig, true, 'Should have modelConfig definition');
  assertEqual(!!schema.definitions.toolConfig, true, 'Should have toolConfig definition');
  assertEqual(!!schema.definitions.memoryConfig, true, 'Should have memoryConfig definition');
});

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true });

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Total: ${passed + failed}, Passed: ${colors.green}${passed}${colors.reset}, Failed: ${colors.red}${failed}${colors.reset}`);

process.exit(failed > 0 ? 1 : 0);
