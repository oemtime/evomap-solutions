#!/usr/bin/env node
/**
 * Agent Config Validator
 * Validates agent configuration files against JSON Schema
 * 
 * Usage:
 *   node validator.js <config-file> [options]
 *   
 * Options:
 *   --schema <path>    Custom schema path
 *   --format <format>  Output format: json, table, compact (default: table)
 *   --strict           Enable strict mode
 *   --fix              Auto-fix where possible
 *   --help             Show help
 * 
 * Examples:
 *   node validator.js agent.yaml
 *   node validator.js config.json --format compact
 *   node validator.js agent.yaml --strict
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Try to load Ajv for schema validation
let Ajv, addFormats;
try {
  const ajvModule = require('ajv');
  Ajv = ajvModule.default || ajvModule;
  addFormats = require('ajv-formats');
} catch (e) {
  console.error('Error: ajv and ajv-formats are required.');
  console.error('Install with: npm install ajv ajv-formats js-yaml');
  process.exit(1);
}

// CLI Arguments
const args = process.argv.slice(2);
const configFile = args.find(arg => !arg.startsWith('--') && arg.endsWith(('.yaml', '.yml', '.json')));
const schemaPath = args.find((arg, i) => args[i - 1] === '--schema') || 
                   path.join(__dirname, 'agent-config.schema.json');
const format = args.find((arg, i) => args[i - 1] === '--format') || 'table';
const strict = args.includes('--strict');
const shouldFix = args.includes('--fix');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp || !configFile) {
  console.log(`
Agent Config Validator
======================

Validates agent configuration files against JSON Schema.

Usage:
  node validator.js <config-file> [options]

Options:
  --schema <path>    Custom schema path (default: built-in schema)
  --format <format>  Output format: json, table, compact (default: table)
  --strict           Enable strict mode (additional validations)
  --fix              Auto-fix where possible (outputs fixed config)
  --help             Show this help

Examples:
  node validator.js agent.yaml
  node validator.js config.json --format compact
  node validator.js agent.yaml --schema ./custom-schema.json

Exit Codes:
  0 - Valid configuration
  1 - Validation errors
  2 - File/parse errors
`);
  process.exit(0);
}

// Load and parse config file
function loadConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.json') {
    return JSON.parse(content);
  } else if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(content);
  } else {
    // Try JSON first, then YAML
    try {
      return JSON.parse(content);
    } catch {
      return yaml.load(content);
    }
  }
}

// Load schema
function loadSchema(schemaPath) {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  return JSON.parse(content);
}

// Color codes for terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

// Format error message
function formatError(error) {
  const path = error.instancePath || 'root';
  const message = error.message;
  const params = error.params ? JSON.stringify(error.params) : '';
  
  return {
    path,
    message,
    params,
    severity: error.keyword === 'required' ? 'error' : 'warning'
  };
}

// Table format output
function outputTable(errors, warnings, config) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Agent Configuration Validation Report               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Summary
  const errorCount = errors.length;
  const warningCount = warnings.length;
  
  if (errorCount === 0 && warningCount === 0) {
    console.log(`${colors.green}✓ Configuration is valid!${colors.reset}\n`);
  } else {
    console.log(`Validation Results:`);
    console.log(`  ${errorCount > 0 ? colors.red : colors.green}Errors: ${errorCount}${colors.reset}`);
    console.log(`  ${warningCount > 0 ? colors.yellow : colors.green}Warnings: ${warningCount}${colors.reset}\n`);
  }
  
  // Config info
  if (config) {
    console.log(`${colors.blue}Configuration Info:${colors.reset}`);
    console.log(`  Name: ${config.name || 'N/A'}`);
    console.log(`  Version: ${config.version || 'N/A'}`);
    console.log(`  Type: ${config.type || 'N/A'}`);
    console.log(`  Framework: ${config.framework || 'N/A'}\n`);
  }
  
  // Errors
  if (errors.length > 0) {
    console.log(`${colors.red}Errors:${colors.reset}`);
    errors.forEach((err, i) => {
      console.log(`  ${i + 1}. [${err.path}] ${err.message}`);
    });
    console.log();
  }
  
  // Warnings
  if (warnings.length > 0) {
    console.log(`${colors.yellow}Warnings:${colors.reset}`);
    warnings.forEach((warn, i) => {
      console.log(`  ${i + 1}. [${warn.path}] ${warn.message}`);
    });
    console.log();
  }
  
  // Quick fixes
  if (errors.length > 0) {
    console.log(`${colors.gray}Quick Fixes:${colors.reset}`);
    console.log(`  • Check property names match the schema`);
    console.log(`  • Ensure required fields are present`);
    console.log(`  • Verify data types are correct\n`);
  }
}

// Compact format output
function outputCompact(errors, warnings) {
  const total = errors.length + warnings.length;
  if (total === 0) {
    console.log('✓ Valid');
  } else {
    const items = [...errors.map(e => `E:${e.path}:${e.message}`), 
                   ...warnings.map(w => `W:${w.path}:${w.message}`)];
    console.log(items.join('\n'));
  }
}

// JSON format output
function outputJson(errors, warnings, config) {
  const result = {
    valid: errors.length === 0,
    summary: {
      errors: errors.length,
      warnings: warnings.length
    },
    errors,
    warnings,
    configInfo: config ? {
      name: config.name,
      version: config.version,
      type: config.type,
      framework: config.framework
    } : null
  };
  console.log(JSON.stringify(result, null, 2));
}

// Additional strict validations
function strictValidations(config) {
  const warnings = [];
  
  // Check for recommended fields
  if (!config.description) {
    warnings.push({
      path: 'description',
      message: 'Description is recommended for documentation',
      severity: 'warning'
    });
  }
  
  // Check for security settings
  if (!config.security) {
    warnings.push({
      path: 'security',
      message: 'Security configuration is recommended',
      severity: 'warning'
    });
  }
  
  // Check model temperature range
  if (config.models) {
    const models = Array.isArray(config.models) ? config.models : [config.models];
    models.forEach((model, i) => {
      if (model.temperature !== undefined && (model.temperature > 1.5 || model.temperature < 0)) {
        warnings.push({
          path: `models[${i}].temperature`,
          message: `Temperature ${model.temperature} is outside recommended range [0, 1.5]`,
          severity: 'warning'
        });
      }
    });
  }
  
  // Check for tool timeout
  if (config.tools) {
    config.tools.forEach((tool, i) => {
      if (!tool.timeout) {
        warnings.push({
          path: `tools[${i}].timeout`,
          message: `Tool "${tool.name}" should have a timeout configured`,
          severity: 'warning'
        });
      }
    });
  }
  
  return warnings;
}

// Main validation
function validate() {
  try {
    // Load files
    const config = loadConfig(configFile);
    const schema = loadSchema(schemaPath);
    
    // Setup Ajv
    const ajv = new Ajv({ 
      allErrors: true, 
      strict: false,
      verbose: true 
    });
    addFormats(ajv);
    
    // Compile and validate
    const validate = ajv.compile(schema);
    const valid = validate(config);
    
    let errors = [];
    let warnings = [];
    
    if (!valid && validate.errors) {
      errors = validate.errors.map(formatError);
    }
    
    // Run strict validations
    if (strict) {
      const strictWarnings = strictValidations(config);
      warnings = [...warnings, ...strictWarnings];
    }
    
    // Output based on format
    switch (format) {
      case 'json':
        outputJson(errors, warnings, config);
        break;
      case 'compact':
        outputCompact(errors, warnings);
        break;
      case 'table':
      default:
        outputTable(errors, warnings, config);
        break;
    }
    
    // Exit code
    process.exit(errors.length > 0 ? 1 : 0);
    
  } catch (error) {
    if (format === 'json') {
      console.log(JSON.stringify({
        valid: false,
        error: error.message,
        stack: error.stack
      }, null, 2));
    } else {
      console.error(`${colors.red}Error:${colors.reset} ${error.message}`);
    }
    process.exit(2);
  }
}

// Run validation
validate();
