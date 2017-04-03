const got = require( 'got' );
const {
    AllHtmlEntities,
    XmlEntities,
} = require( 'html-entities' );

const Post = require( '../Post.js' );
const load = require( '../load.js' );

const xmlEntities = new XmlEntities();
const htmlEntities = new AllHtmlEntities();

class Reddit {
    constructor () {
        this.apiBase = 'https://www.reddit.com';
        this.userPostsUrl = '/user/{username}.json';
        this.singleCommentUrl = '/comments/{topicID}.json';

        this.requestCount = 0;

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

        return await load.get( this.getTopicLink( topicID ), {
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
            // throw new Error( `Unable to find post with id ${ commentID } in ${ topicID }` );

            return false;
        }

        const text = commentData.data.body_html || commentData.data.selftext_html;

        if ( !text ) {
            // If we reply directly to a topic, this might be the case
            return '';
            // throw new Error( `Unable to load text for ${ commentID }. Got ${ JSON.stringify( commentData, null, 4 ) }` );
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
            // console.log( `${ url } could not be resolved as a real url. It returned a ${ urlLoadError.statusCode }` );

            return false;
        }

        return response.url;
    }

    async parsePost ( uid, currentPost, currentPosts ) {
        const post = new Post();
        let parentPost = '';

        switch ( currentPost.kind ) {
            case 't1':
                // Posted a reply (probably)
                post.topic = {
                    title: currentPost.data.link_title,
                    url: currentPost.data.link_url,
                };

                if ( currentPost.data.link_url.indexOf( 'www.reddit.com' ) === -1 ) {
                    const redirectUrl = await this.getRedirectUrl( `${ this.apiBase }/comments/${ this.parseId( currentPost.data.link_id ) }/` );

                    if ( redirectUrl ) {
                        post.topic.url = redirectUrl;
                    } else {
                        // If the redirect is broken, we don't want to store the post right now
                        return false;
                    }
                }

                post.url = `${ post.topic.url }${ currentPost.data.id }/`;

                if ( currentPosts.indexOf( post.url ) > -1 ) {
                    return false;
                }

                parentPost = await this.getParentPostHTML( currentPost.data.link_id, currentPost.data.parent_id );

                if ( parentPost === false ) {
                    return false;
                }

                post.text = parentPost + this.decodeHtml( currentPost.data.body_html );

                post.text = post.text.replace( /href="\/(.+?)\//gim, 'href="https://reddit.com/$1/' );

                break;
            case 't3':
                // Posted a topic (probably)
                post.topic = {
                    title: currentPost.data.title,
                    url: currentPost.data.url,
                };

                if ( !currentPost.data.selftext_html ) {
                    // User posted a link to somewhere
                    return false;
                }

                post.text = this.decodeHtml( currentPost.data.selftext_html );
                post.url = currentPost.data.url;

                if ( currentPosts.indexOf( post.url ) > -1 ) {
                    return false;
                }

                break;
            default:
                console.error( `Unkown reddit type ${ currentPost.kind }` );
                break;
        }

        post.section = currentPost.data.subreddit;
        post.timestamp = currentPost.data.created_utc;
        post.uid = uid;
        post.source = 'Reddit';

        return post;
    }

    loadRecentPosts ( uid, identifier, currentPosts ) {
        return new Promise( ( resolve, reject ) => {
            const url = this.apiBase + this.userPostsUrl.replace( '{username}', identifier );

            load.get( url )
                .then( ( posts ) => {
                    const postList = [];
                    const postPromises = [];

                    if ( !posts || !posts.data.children ) {
                        console.log( `Something is broken with ${ url }` );

                        return false;
                    }

                    for ( let postIndex = 0; postIndex < posts.data.children.length; postIndex = postIndex + 1 ) {
                        const postPromise = this.parsePost( uid, posts.data.children[ postIndex ], currentPosts )
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
