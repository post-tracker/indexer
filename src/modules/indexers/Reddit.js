const got = require( 'got' );
const {
    AllHtmlEntities,
    XmlEntities,
} = require( 'html-entities' );

const load = require( '../load.js' );

const xmlEntities = new XmlEntities();
const htmlEntities = new AllHtmlEntities();

class Reddit {
    constructor ( providerConfig, userData, userIdentifier ) {
        this.apiBase = 'https://www.reddit.com';
        this.userPostsUrl = '/user/{username}.json';
        this.singleCommentUrl = '/comments/{topicID}.json';

        this.identifier = 'Reddit';

        this.user = userData;
        this.userIdentifier = userIdentifier;

        this.postList = [];
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
        return await load.get( this.getTopicLink( topicID ) );
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
            console.log( `${ url } could not be resolved as a real url. It returned a ${ urlLoadError.statusCode }` );

            return false;
        }

        return response.url;
    }

    async loadRecentPosts () {
        const url = this.apiBase + this.userPostsUrl.replace( '{username}', this.userIdentifier );
        const posts = await load.get( url );

        if ( !posts || !posts.data.children ) {
            console.log( `Something is broken with ${ url }` );

            return false;
        }

        for ( let postIndex = 0; postIndex < posts.data.children.length; postIndex = postIndex + 1 ) {
            const currentPost = posts.data.children[ postIndex ];
            const postData = {};
            let parentPost = '';

            switch ( currentPost.kind ) {
                case 't1':
                    // Posted a reply (probably)
                    postData.topic = currentPost.data.link_title;
                    postData.topicUrl = currentPost.data.link_url;

                    if ( currentPost.data.link_url.indexOf( 'www.reddit.com' ) === -1 ) {
                        const redirectUrl = await this.getRedirectUrl( `${ this.apiBase }/comments/${ this.parseId( currentPost.data.link_id ) }/` );

                        if ( redirectUrl ) {
                            postData.topicUrl = redirectUrl;
                        } else {
                            continue;
                        }
                    }

                    postData.url = `${ postData.topicUrl }${ currentPost.data.id }/`;

                    parentPost = await this.getParentPostHTML( currentPost.data.link_id, currentPost.data.parent_id );

                    if ( parentPost === false ) {
                        continue;
                    }

                    postData.content = parentPost + this.decodeHtml( currentPost.data.body_html );

                    postData.content = postData.content.replace( /href="\/(.+?)\//gim, 'href="https://reddit.com/$1/' );

                    break;
                case 't3':
                    // Posted a topic (probably)
                    postData.topic = currentPost.data.title;
                    postData.topicUrl = currentPost.data.url;

                    if ( !currentPost.data.selftext_html ) {
                        // User posted a link to somewhere
                        continue;
                    }

                    postData.content = this.decodeHtml( currentPost.data.selftext_html );
                    postData.url = currentPost.data.url;

                    break;
                default:
                    console.error( `Unkown reddit type ${ currentPost.kind }` );
                    break;
            }

            postData.section = currentPost.data.subreddit;
            postData.timestamp = currentPost.data.created_utc;

            this.postList.push( Object.assign(
                {},
                this.user,
                postData
            ) );
        }

        return this.postList;
    }
}

module.exports = Reddit;
