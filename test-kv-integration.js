/**
 * Test script to verify KV integration is properly structured
 * This doesn't test actual KV functionality (requires Vercel environment)
 * but verifies that all functions are defined and code compiles
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Vercel KV Integration...\n');

// Test 1: Check package.json has @vercel/kv
console.log('1. Checking package.json for @vercel/kv...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (packageJson.dependencies && packageJson.dependencies['@vercel/kv']) {
    console.log('   ✅ @vercel/kv found in dependencies:', packageJson.dependencies['@vercel/kv']);
} else {
    console.log('   ❌ @vercel/kv NOT found in dependencies');
}

// Test 2: Check api/articles.js exists and has correct imports
console.log('\n2. Checking api/articles.js structure...');
const articlesPath = path.join(__dirname, 'api', 'articles.js');
if (fs.existsSync(articlesPath)) {
    const articlesCode = fs.readFileSync(articlesPath, 'utf8');

    // Check for KV import
    if (articlesCode.includes("require('@vercel/kv')")) {
        console.log('   ✅ KV import found');
    } else {
        console.log('   ❌ KV import NOT found');
    }

    // Check for Gemini import
    if (articlesCode.includes("require('@google/generative-ai')")) {
        console.log('   ✅ Gemini AI import found');
    } else {
        console.log('   ❌ Gemini AI import NOT found');
    }

    // Check for cache functions
    const functions = [
        'loadCache',
        'saveCache',
        'mergeArticles',
        'categorizeArticlesWithAI'
    ];

    console.log('\n   Checking for required functions:');
    functions.forEach(fn => {
        if (articlesCode.includes(`function ${fn}`) || articlesCode.includes(`async function ${fn}`)) {
            console.log(`   ✅ ${fn}() found`);
        } else {
            console.log(`   ❌ ${fn}() NOT found`);
        }
    });

    // Check for KV operations in handler
    console.log('\n   Checking handler uses KV:');
    if (articlesCode.includes('await loadCache()')) {
        console.log('   ✅ Handler calls loadCache()');
    } else {
        console.log('   ❌ Handler does NOT call loadCache()');
    }

    if (articlesCode.includes('await saveCache(')) {
        console.log('   ✅ Handler calls saveCache()');
    } else {
        console.log('   ❌ Handler does NOT call saveCache()');
    }

    if (articlesCode.includes('categorizeArticlesWithAI')) {
        console.log('   ✅ Handler includes AI categorization');
    } else {
        console.log('   ❌ Handler does NOT include AI categorization');
    }

    // Check response includes cache metadata
    console.log('\n   Checking response metadata:');
    const metadataFields = ['cached', 'fresh', 'aiCategorized', 'processingTime'];
    metadataFields.forEach(field => {
        if (articlesCode.includes(`${field}:`)) {
            console.log(`   ✅ Response includes "${field}" field`);
        } else {
            console.log(`   ⚠️  Response may be missing "${field}" field`);
        }
    });

} else {
    console.log('   ❌ api/articles.js NOT found');
}

// Test 3: Check documentation exists
console.log('\n3. Checking documentation files...');
const docs = [
    'VERCEL_KV_SETUP.md',
    'KV_IMPLEMENTATION_SUMMARY.md'
];

docs.forEach(doc => {
    if (fs.existsSync(doc)) {
        const size = fs.statSync(doc).size;
        console.log(`   ✅ ${doc} exists (${Math.round(size / 1024)}KB)`);
    } else {
        console.log(`   ❌ ${doc} NOT found`);
    }
});

// Test 4: Try to load the module (check for syntax errors)
console.log('\n4. Checking for syntax errors...');
try {
    // Mock KV to avoid import errors
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function(id) {
        if (id === '@vercel/kv') {
            // Return mock KV
            return {
                kv: {
                    get: async () => null,
                    set: async () => true
                }
            };
        }
        return originalRequire.apply(this, arguments);
    };

    // Try to require the module
    require('./api/articles.js');
    console.log('   ✅ No syntax errors detected');

    // Restore original require
    Module.prototype.require = originalRequire;

} catch (error) {
    console.log('   ❌ Syntax error detected:', error.message);
}

// Test 5: Check environment setup
console.log('\n5. Checking environment configuration...');
if (fs.existsSync('.env')) {
    console.log('   ✅ .env file exists');
    const envContent = fs.readFileSync('.env', 'utf8');

    if (envContent.includes('GEMINI_API_KEY')) {
        console.log('   ✅ GEMINI_API_KEY configured in .env');
    } else {
        console.log('   ℹ️  GEMINI_API_KEY not in .env (AI features will be disabled)');
    }
} else {
    console.log('   ℹ️  .env file not found (expected for Vercel deployment)');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));
console.log(`
✅ = Passed
❌ = Failed
ℹ️  = Info/Optional
⚠️  = Warning

NEXT STEPS:
1. Review any ❌ failures above and fix them
2. Deploy to Vercel
3. Create KV database in Vercel Dashboard (see VERCEL_KV_SETUP.md)
4. Add environment variables (KV auto-created, add GEMINI_API_KEY manually)
5. Test the deployed API endpoint
6. Monitor function logs for KV cache hits

For detailed setup instructions, see: VERCEL_KV_SETUP.md
`);
