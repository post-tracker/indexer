const cheerio = require( 'cheerio' );

const Post = require( '../Post.js' );

function escapeHtml ( text ) {
    return String( text )
        .replace( /&/g, '&amp;' )
        .replace( /</g, '&lt;' )
        .replace( />/g, '&gt;' );
}

class RSI {
    constructor ( userId, indexerConfig, load ) {
        this.urlBase = 'https://robertsspaceindustries.com';
        this.postsUrl = 'https://robertsspaceindustries.com/api/community/getTrackedPosts';
        this.singlePostUrl = 'https://robertsspaceindustries.com/api/spectrum/forum/thread/nested';

        this.userId = userId;
        this.load = load;
    }

    // Render a single Draft.js "text" content-block (a list of styled blocks)
    // to HTML.
    renderTextBlock ( contentBlock ) {
        let post = '';
        let isOrderedList = false;
        let isUnorderedList = false;
        let isCodeBlock = false;

        contentBlock.data.blocks.forEach( ( block ) => {
            let appendContent = block.text;

            // Code blocks are raw text: never parse their content as
            // markup and never apply inline styles to it. Group runs
            // of consecutive code-block lines into a single <pre>.
            if ( block.type === 'code-block' ) {
                if ( !isCodeBlock ) {
                    post = `${ post }<pre>`;
                    isCodeBlock = true;
                } else {
                    post = `${ post }\n`;
                }

                post = `${ post }${ escapeHtml( block.text ) }`;

                return;
            }

            if ( isCodeBlock ) {
                post = `${ post }</pre>`;
                isCodeBlock = false;
            }

            if ( block.inlineStyleRanges.length > 0 ) {
                let startOffset = 0;

                block.inlineStyleRanges.forEach( ( styleData ) => {
                    const text = appendContent.split( '' );
                    const wrapText = text.splice( styleData.offset + startOffset, styleData.length );
                    let insertText = '';

                    if ( styleData.style === 'BOLD' ) {
                        insertText = `<b>${ wrapText.join( '' ) }</b>`;
                    }

                    if ( styleData.style === 'UNDERLINE' ) {
                        insertText = `<u>${ wrapText.join( '' ) }</u>`;
                    }

                    insertText.split( '' );
                    for ( let i = 0; i < insertText.length; i = i + 1 ) {
                        text.splice( styleData.offset + startOffset + i, 0, insertText[ i ] );
                    }

                    // Add the length of the starting tag so we account for that down the line
                    // This will break when the offset isn't at the start for one tag and not the other
                    // eslint-disable-next-line no-magic-numbers
                    startOffset = startOffset + 3;

                    appendContent = text.join( '' );
                } );

                appendContent = `<div>${ appendContent }</div>`;
            }

            if ( isUnorderedList && block.type !== 'unordered-list-item' ) {
                post = `${ post }</ul>`;
                isUnorderedList = false;
            }

            if ( isOrderedList && block.type !== 'ordered-list-item' ) {
                post = `${ post }</ol>`;
                isOrderedList = false;
            }

            if ( block.type === 'unordered-list-item' ) {
                if ( !isUnorderedList ) {
                    post = `${ post }<ul>`;
                    isUnorderedList = true;
                }

                appendContent = `<li>${ appendContent }</li>`;
            }

            if ( block.type === 'ordered-list-item' ) {
                if ( !isOrderedList ) {
                    post = `${ post }<ol>`;
                    isOrderedList = true;
                }

                appendContent = `<li>${ appendContent }</li>`;
            }

            if ( block.type === 'header-one' ) {
                appendContent = `<h3>${ appendContent }</h3>`;
            }

            // If it's plain, wrap it in a p
            if ( appendContent === block.text ) {
                appendContent = `<p>${ appendContent }</p>`;
            }

            post = `${ post }${ appendContent }`;
        } );

        // Close any structure that ran to the end of the block list
        if ( isCodeBlock ) {
            post = `${ post }</pre>`;
        }

        if ( isUnorderedList ) {
            post = `${ post }</ul>`;
        }

        if ( isOrderedList ) {
            post = `${ post }</ol>`;
        }

        return post;
    }

    // Render a list of Spectrum content-blocks (text / image / quote / video).
    // Quotes nest their own content-blocks, so this recurses.
    renderBlocks ( contentBlocks ) {
        let post = '';

        ( contentBlocks || [] ).forEach( ( contentBlock ) => {
            switch ( contentBlock.type ) {
                case 'text':
                    post = `${ post }${ this.renderTextBlock( contentBlock ) }`;
                    break;
                case 'image':
                    post = `${ post }<img src="${ contentBlock.data[ 0 ].data.url }">`;
                    break;
                case 'quote': {
                    // A quote's `data` is itself an array of content-blocks.
                    const author = contentBlock.member && contentBlock.member.displayname;
                    let quote = '<blockquote>';

                    if ( author ) {
                        quote = `${ quote }<div class="quoteauthor">Originally posted by <b>${ escapeHtml( author ) }</b></div>`;
                    }

                    quote = `${ quote }${ this.renderBlocks( contentBlock.data ) }</blockquote>`;
                    post = `${ post }${ quote }`;
                    break;
                }
                case 'video': {
                    // Spectrum embeds (YouTube etc.). The site rewrites iframes to
                    // links anyway, so emit a link straight to the source.
                    const videoData = contentBlock.data && contentBlock.data.data;
                    const url = videoData && videoData.url;

                    if ( url ) {
                        const label = videoData.title || url;
                        post = `${ post }<a href="${ url }">${ escapeHtml( label ) }</a>`;
                    }

                    break;
                }
                default:
                    console.error( `Unknown type ${ contentBlock.type }` );
            }
        } );

        return post;
    }

    buildPost ( postData ) {
        return this.renderBlocks( postData.content_blocks );
    }

    async loadPost ( thread ) {
        let page = false;
        const requestBody = {
            slug: thread.slug,
            sort: 'votes',
            // eslint-disable-next-line camelcase
            target_reply_id: thread.postId,
        };

        try {
            page = await this.load.get( this.singlePostUrl, {
                body: JSON.stringify( requestBody ),
                headers: {
                    'content-type': 'application/json',
                },
                isJSON: true,
                parameters: {
                    id: thread.postId,
                },
            } );
        } catch ( pageLoadError ) {
            console.error( pageLoadError );
        }

        return page;
    }

    getReply ( post, id ) {
        for ( let i = 0; i < post.replies.length; i = i + 1 ) {
            if ( post.replies[ i ].id === id ) {
                return post.replies[ i ];
            }
        }

        if ( post.content_reply_id === id ) {
            return post;
        }

        console.error( `Unable to load ${ id }` );

        return false;
    }

    async getPost ( thread ) {
        let threadData = false;

        try {
            threadData = await this.loadPost( thread );
        } catch ( threadLoadError ) {
            console.error( threadLoadError );
        }

        if ( !threadData || !threadData.data ) {
            console.error( `Unable to load post ${ thread.postId } (${ thread.slug })` );

            return false;
        }

        const post = new Post();

        if ( threadData.data.content_reply_id === thread.postId ) {
            post.text = this.buildPost( threadData.data );
            post.timestamp = threadData.data.time_created;
        } else {
            const devPost = this.getReply( threadData.data, thread.postId );

            if ( !devPost ) {
                return false;
            }

            let parentData;

            if ( devPost.parent_reply_reference ) {
                let requestData;

                try {
                    requestData = await this.loadPost( {
                        postId: devPost.parent_reply_reference.id,
                        slug: thread.slug,
                    } );
                } catch ( parentLoadError ) {
                    console.error( parentLoadError );
                }

                if ( !requestData || !requestData.data ) {
                    return false;
                }

                parentData = this.getReply( requestData.data, devPost.parent_reply_reference.id );
            } else {
                parentData = threadData.data;
            }

            post.text = `<blockquote>
                <div class="quoteauthor">
                    Originally posted by
                    <b>
                        <a href="${ thread.topicUrl }${ parentData.id }">
                            ${ parentData.member.displayname }
                        </a>
                    </b>
                </div>
                ${ this.buildPost( parentData ) }
            </blockquote>
            ${ this.buildPost( devPost ) }`;

            post.timestamp = devPost.time_created;
        }

        post.topicTitle = thread.topic;
        post.topicUrl = thread.topicUrl;
        post.url = thread.url;

        return post;
    }

    async loadRecentPosts () {
        let postsHtml;

        try {
            const response = await this.load.get( this.postsUrl, {
                body: JSON.stringify( {
                    date: new Date().toLocaleDateString( 'sv' ),
                    page: 1,
                    pagesize: 1,
                } ),
                headers: {
                    'content-type': 'application/json',
                },
                isJSON: true,
            } );

            if ( response ) {
                postsHtml = response.data.html;
            }
        } catch ( activitiesError ) {
            console.error( activitiesError );
        }

        if ( !postsHtml ) {
            return [];
        }

        const $ = cheerio.load( postsHtml );
        const rawPosts = [];

        $( 'a' ).each( ( index, element ) => {
            const $post = $( element );
            const matches = $post.attr( 'href' ).match( /(.*\/(.+?)\/)(\d+)$/ );

            rawPosts.push( {
                identifier: $post.find( '.handle' ).text(),
                postId: matches[ 3 ],
                section: $post.find( '.category' ).text(),
                slug: matches[ 2 ],
                topic: $post.find( '.thread' ).text(),
                topicUrl: `${ this.urlBase }${ matches[ 1 ] }`,
                url: `${ this.urlBase }${ $post.attr( 'href' ) }`,
            } );
        } );

        const postPromises = [];

        for ( let i = 0; i < rawPosts.length; i = i + 1 ) {
            if ( rawPosts[ i ].identifier !== this.userId ) {
                continue;
            }

            postPromises.push( this.getPost( rawPosts[ i ] ) );
        }

        return Promise.all( postPromises );
    }
}

module.exports = RSI;
