const got = require( 'got' );
const {
    AllHtmlEntities,
    XmlEntities,
} = require( 'html-entities' );
const sha1 = require( 'sha1' );

const Post = require( '../Post.js' );

const xmlEntities = new XmlEntities();
const htmlEntities = new AllHtmlEntities();

class Reddit {
    constructor ( userId, indexerConfig, hashes, load ) {
        this.apiBase = 'https://www.reddit.com';
        this.userPostsUrl = '/user/{username}.json';
        this.singleCommentUrl = '/comments/{topicID}.json';

        this.requestCount = 0;

        this.postHashes = hashes;
        this.userId = userId;

        this.stats = {
            existing: 0,
            link: 0,
            noParent: 0,
            noRedirect: 0,
            notFoundInTopic: 0,
        };

        this.load = load;
    }

    decodeHtml ( encodedHtml ) {
        return xmlEntities.decode( htmlEntities.decode( encodedHtml ) );
    }

    parseId ( id ) {
        return id.replace( 't1_', '' ).replace( 't3_', '' );
    }

    getTopicLink ( topicID ) {
        return this.apiBase + this.singleCommentUrl.replace( '{topicID}', this.parseId( topicID ) );
    }

    async getTopic ( topicID ) {
        this.requestCount = this.requestCount + 1;

        return await this.load.get( this.getTopicLink( topicID ), {
            isJSON: true,
            permanent: true,
        } );
    }

    findComment ( listing, commentID ) {
        if ( !listing ) {
            console.log( 'Got invalid listing data' );

            return false;
        }

        for ( let i = 0; i < listing.length; i = i + 1 ) {
            if ( listing[ i ].data.id === commentID ) {
                return listing[ i ];
            }

            if ( listing[ i ].data.replies ) {
                const post = this.findComment( listing[ i ].data.replies.data.children, commentID );

                if ( post ) {
                    return post;
                }
            }
        }

        return false;
    }

    findCommentInTopic ( topicData, commentID ) {
        if ( !topicData ) {
            // console.log( 'Got invalid topic data' );

            return false;
        }

        for ( let i = 0; i < topicData.length; i = i + 1 ) {
            const post = this.findComment( topicData[ i ].data.children, this.parseId( commentID ) );

            if ( post ) {
                return post;
            }
        }

        return false;
    }

    async getParentPostHTML ( topicID, commentID ) {
        const topicData = await this.getTopic( topicID );
        const commentData = this.findCommentInTopic( topicData, commentID );

        if ( !commentData ) {
            // console.log( `Unable to find post with id ${ commentID } in ${ topicID }` );
            this.stats.notFoundInTopic = this.stats.notFoundInTopic + 1;

            return false;
        }

        const text = commentData.data.body_html || commentData.data.selftext_html;

        if ( !text ) {
            // If we reply directly to a topic, this might be the case
            return '';
        }

        return `<blockquote>
            <div class="bb_quoteauthor">
                Originally posted by
                <b>
                    <a href="${ topicData[ 0 ].data.children[ 0 ].data.permalink }${ commentData.data.id }">
                        ${ commentData.data.author }
                    </a>
                </b>
            </div>
            ${ this.decodeHtml( text ) }
        </blockquote>`;
    }

    async getRedirectUrl ( url ) {
        let response;

        try {
            response = await got( url );
        } catch ( urlLoadError ) {
            // console.log( `${ url } could not be resolved as. It returned a ${ urlLoadError.statusCode }` );

            return false;
        }

        return response.url;
    }

    async parsePost ( currentPost ) {
        const post = new Post();
        let parentPost = '';

        switch ( currentPost.kind ) {
            case 't1':
                // Posted a reply (probably)
                post.topicTitle = currentPost.data.link_title;
                post.topicUrl = currentPost.data.link_url;

                if ( currentPost.data.link_url.indexOf( 'www.reddit.com' ) === -1 ) {
                    const redirectUrl = await this.getRedirectUrl( `${ this.apiBase }/comments/${ this.parseId( currentPost.data.link_id ) }/` );

                    if ( redirectUrl ) {
                        post.topicUrl = redirectUrl;
                    } else {
                        // If the redirect is broken, we don't want to store the post right now
                        console.log( 'Got no redirect' );
                        this.stats.noRedirect = this.stats.noRedirect + 1;

                        return false;
                    }
                }

                post.url = `${ post.topicUrl }${ currentPost.data.id }/`;

                if ( this.postHashes.indexOf( sha1( post.url ) ) > -1 ) {
                    // console.log( 'Post exists' );
                    this.stats.existing = this.stats.existing + 1;

                    return false;
                }

                parentPost = await this.getParentPostHTML( currentPost.data.link_id, currentPost.data.parent_id );

                if ( parentPost === false ) {
                    // console.log( 'Could not get parent post' );
                    this.stats.noParent = this.stats.noParent + 1;

                    return false;
                }

                post.text = parentPost + this.decodeHtml( currentPost.data.body_html );

                post.text = post.text.replace( /href="\/(.+?)\//gim, 'href="https://reddit.com/$1/' );

                break;
            case 't3':
                // Posted a topic (probably)
                post.topicTitle = currentPost.data.title;
                post.topicUrl = currentPost.data.url;

                if ( !currentPost.data.selftext_html ) {
                    // User posted a link to somewhere
                    // console.log( 'Post to link' );
                    this.stats.link = this.stats.link + 1;

                    return false;
                }

                post.text = this.decodeHtml( currentPost.data.selftext_html );
                post.url = currentPost.data.url;

                if ( this.postHashes.indexOf( sha1( post.url ) ) > -1 ) {
                    // console.log( 'Post exists' );
                    this.stats.existing = this.stats.existing + 1;

                    return false;
                }

                break;
            default:
                console.error( `Unkown reddit type ${ currentPost.kind }` );
                break;
        }

        post.section = currentPost.data.subreddit;
        post.timestamp = currentPost.data.created_utc;

        return post;
    }

    loadRecentPosts () {
        return new Promise( ( resolve, reject ) => {
            const url = this.apiBase + this.userPostsUrl.replace( '{username}', this.userId );

            this.load.get( url, {
                isJSON: true,
            } )
                .then( ( posts ) => {
                    const postList = [];
                    const postPromises = [];

                    if ( !posts || !posts.data.children ) {
                        console.log( `Something is broken with ${ url }` );

                        return false;
                    }

                    for ( let postIndex = 0; postIndex < posts.data.children.length; postIndex = postIndex + 1 ) {
                        const postPromise = this.parsePost( posts.data.children[ postIndex ] )
                            .then( ( post ) => {
                                if ( post ) {
                                    postList.push( post );
                                }
                            } )
                            .catch( ( error ) => {
                                throw error;
                            } );

                        postPromises.push( postPromise );
                    }

                    Promise.all( postPromises )
                        .then( () => {
                            // console.log( JSON.stringify( this.stats, null, 4 ) );
                            resolve( postList );
                        } )
                        .catch( ( error ) => {
                            reject( error );
                        } );

                    return true;
                } )
                .catch( ( error ) => {
                    reject( error );
                } );
        } );
    }
}

module.exports = Reddit;
