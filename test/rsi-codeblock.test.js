// Regression tests for post-tracker/site issues around RSI (Star Citizen /
// Spectrum) post rendering in buildPost():
//
//   #60  code blocks were stripped (no `code-block` handling; raw, unescaped).
//   +    `quote` and `video` content_blocks were dropped entirely
//        ("Unknown type quote" / "Unknown type video" in the indexer logs).
//
// Run: API_TOKEN=dummy node test/rsi-codeblock.test.js
//   (API_TOKEN is only needed because modules/Post.js -> modules/api.js
//    asserts it at import time; this test makes no network calls.)
'use strict';

const assert = require( 'assert' );
const fs = require( 'fs' );
const path = require( 'path' );
const RSI = require( '../modules/indexers/rsi.js' );

const indexer = new RSI( 'devuser', {}, null );

// ---------------------------------------------------------------------------
// 1. Code blocks (#60) — HOTAS/keyboard XML from the issue report.
// ---------------------------------------------------------------------------
const codePost = {
    content_blocks: [
        {
            type: 'text',
            data: {
                blocks: [
                    { type: 'unstyled', text: 'Here are the bindings:', inlineStyleRanges: [] },
                    { type: 'code-block', text: '<options type="keyboard" instance="1" Product="Tastatur {6F1D2B61-D5A0-11CF-BFC7-444553540000}"/>', inlineStyleRanges: [] },
                    { type: 'code-block', text: '<options type="joystick" instance="1" Product="X56 H.O.T.A.S. Stick">', inlineStyleRanges: [] },
                    { type: 'unstyled', text: 'Done & dusted.', inlineStyleRanges: [] },
                ],
            },
        },
    ],
};

const codeHtml = indexer.buildPost( codePost );

assert.ok( codeHtml.includes( '<pre>' ) && codeHtml.includes( '</pre>' ), 'code needs a closed <pre>' );
assert.strictEqual( ( codeHtml.match( /<pre>/g ) || [] ).length, 1, 'consecutive code lines share one <pre>' );
assert.ok( codeHtml.includes( '&lt;options type="keyboard"' ), 'angle brackets in code must be escaped' );
assert.ok( !codeHtml.includes( '<options' ), 'raw <options> tag must not survive' );
assert.ok( codeHtml.includes( '<p>Here are the bindings:</p>' ), 'paragraph before code preserved' );

// Trailing code block (runs to end of block list) is still closed.
const tailCode = indexer.buildPost( {
    content_blocks: [ { type: 'text', data: { blocks: [ { type: 'code-block', text: 'a < b', inlineStyleRanges: [] } ] } } ],
} );
assert.ok( tailCode.startsWith( '<pre>' ) && tailCode.endsWith( '</pre>' ), 'trailing code block must be closed' );
assert.ok( tailCode.includes( 'a &lt; b' ), 'trailing code must be escaped' );

// ---------------------------------------------------------------------------
// 2. quote + video blocks — real fixtures captured from the live Spectrum API.
// ---------------------------------------------------------------------------
const fixtures = JSON.parse( fs.readFileSync( path.join( __dirname, 'fixtures-rsi.json' ), 'utf8' ) );

// quote: renders a <blockquote> with the author, and recurses into the
// quote's nested content-blocks (an ordered list here).
const quoteHtml = indexer.buildPost( { content_blocks: [ fixtures.quote ] } );
assert.ok( quoteHtml.includes( '<blockquote>' ) && quoteHtml.includes( '</blockquote>' ), 'quote needs a closed <blockquote>' );
assert.ok( quoteHtml.includes( 'SkaTac' ), 'quote must credit its author' );
assert.ok( quoteHtml.includes( '<ol>' ) && quoteHtml.includes( '<li>Ctrl+C</li>' ), 'quote must render its nested list content' );
assert.ok( !quoteHtml.includes( 'Unknown type' ), 'quote must not fall through to the default branch' );

// video: emits a link to the source (site rewrites iframes to links anyway).
const videoHtml = indexer.buildPost( { content_blocks: [ fixtures.video ] } );
assert.ok( videoHtml.includes( 'href="https://www.youtube.com/watch?v=3l-epO6oUHE"' ), 'video must link to its source url' );
assert.ok( videoHtml.includes( '<a ' ), 'video must render as an anchor' );

console.log( 'rsi rendering: all assertions passed' );
console.log( '--- code sample ---\n' + codeHtml );
console.log( '--- quote sample ---\n' + quoteHtml );
console.log( '--- video sample ---\n' + videoHtml );
