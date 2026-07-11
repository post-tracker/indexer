// Regression test for issue #60 (post-tracker/site):
// Star Citizen (RSI/Spectrum) code blocks were stripped because buildPost()
// had no `code-block` case, so raw code fell through to the <p> branch and
// its literal HTML tags were parsed (and stripped) by the browser.
//
// Run: API_TOKEN=dummy node test/rsi-codeblock.test.js
//   (API_TOKEN is only needed because modules/Post.js -> modules/api.js
//    asserts it at import time; this test makes no network calls.)
'use strict';

const assert = require( 'assert' );
const RSI = require( '../modules/indexers/rsi.js' );

const indexer = new RSI( 'devuser', {}, null );

// --- Fixture: a Spectrum post that mixes a paragraph and a code block, with
// the exact HOTAS/keyboard XML from the issue report. ---
const postData = {
    content_blocks: [
        {
            type: 'text',
            data: {
                blocks: [
                    {
                        type: 'unstyled',
                        text: 'Here are the bindings:',
                        inlineStyleRanges: [],
                    },
                    {
                        type: 'code-block',
                        text: '<options type="keyboard" instance="1" Product="Tastatur {6F1D2B61-D5A0-11CF-BFC7-444553540000}"/>',
                        inlineStyleRanges: [],
                    },
                    {
                        type: 'code-block',
                        text: '<options type="joystick" instance="1" Product="X56 H.O.T.A.S. Stick">',
                        inlineStyleRanges: [],
                    },
                    {
                        type: 'unstyled',
                        text: 'Done & dusted.',
                        inlineStyleRanges: [],
                    },
                ],
            },
        },
    ],
};

const html = indexer.buildPost( postData );

// 1. Code lives inside a single <pre>, not <p>.
assert.ok( html.includes( '<pre>' ), 'expected a <pre> block' );
assert.ok( html.includes( '</pre>' ), 'expected the <pre> block to be closed' );

// 2. Consecutive code-block lines are grouped into ONE <pre>.
assert.strictEqual(
    ( html.match( /<pre>/g ) || [] ).length,
    1,
    'consecutive code lines should share a single <pre>'
);

// 3. The raw markup is HTML-escaped so the browser renders it as text
//    instead of parsing (and stripping) it.
assert.ok(
    html.includes( '&lt;options type=&quot;keyboard&quot;' ) ||
    html.includes( '&lt;options type="keyboard"' ),
    'angle brackets inside code must be escaped'
);
assert.ok( !html.includes( '<options' ), 'raw <options> tag must not survive' );

// 4. Normal paragraphs are unaffected and their & is still escaped nowhere-special
//    (they render as before).
assert.ok( html.includes( '<p>Here are the bindings:</p>' ), 'paragraph before code preserved' );
assert.ok( html.includes( 'Done &' ) || html.includes( 'Done & dusted' ), 'paragraph after code preserved' );

// 5. Code block that runs to the very end of the block list is still closed.
const tailCode = indexer.buildPost( {
    content_blocks: [ {
        type: 'text',
        data: { blocks: [ { type: 'code-block', text: 'a < b', inlineStyleRanges: [] } ] },
    } ],
} );
assert.ok( tailCode.startsWith( '<pre>' ) && tailCode.endsWith( '</pre>' ), 'trailing code block must be closed' );
assert.ok( tailCode.includes( 'a &lt; b' ), 'trailing code must be escaped' );

console.log( 'rsi-codeblock: all assertions passed' );
console.log( '--- sample output ---' );
console.log( html );
