const path = require( 'path' );
const http = require( 'http' );
const https = require( 'https' );
const url = require( 'url' );

const Entities = require( 'html-entities' ).AllHtmlEntities;
const imageType = require( 'image-type' );

const Post = require( '../Post.js' );
const BBCode = require( '../BBCode.js' );

const MILLISECONDS_PER_SECOND = 1000;

const entities = new Entities();
let config = {};

const ALLOWED_IMAGE_EMBEDS = [
    'gif',
    'jpg',
    'png',
];

try {
    // eslint-disable-next-line global-require
    config = require( path.join( __dirname, '../../../config/config.json' ) );
} catch ( configLoadError ) {
    console.error( 'Unable to find config file. Unable to load BungieNet posts' );
}

class BungieNet {
    constructor ( userId, indexerConfig, load ) {
        this.userActivityUrl = 'https://www.bungie.net/Platform/Activity/User/{userId}/Activities/Forums/?lc=en&fmt=true&lcin=true&currentpage=1&format=0';
        this.threadUrl = 'https://www.bungie.net/platform/forum/GetPostAndParent/{threadId}/?showbanned=0';

        this.userId = userId;
        this.load = load;
    }

    getFullPostUrl ( postId ) {
        return `https://www.bungie.net/en/Forums/Post/${ postId }`;
    }

    getAuthorNick ( authors, post ) {
        for ( let i = 0; i < authors.length; i = i + 1 ) {
            if ( authors[ i ].membershipId === post.authorMembershipId ) {
                return authors[ i ].displayName;
            }
        }

        return false;
    }

    getPostContent ( post ) {
        return new Promise( ( resolve, reject ) => {
            if ( post.body ) {
                post.body = entities.decode( post.body );
                post.body = BBCode.parse( post.body );

                resolve( post.body );

                return true;
            }

            if ( post.urlLinkOrImage ) {
                const contentURL = url.parse( post.urlLinkOrImage );
                let imageTypePromise;

                if ( contentURL.protocol === 'https:' ) {
                    imageTypePromise = new Promise( ( imageTypeResolve ) => {
                        https.get( post.urlLinkOrImage, ( response ) => {
                            response.once( 'data', ( chunk ) => {
                                response.destroy();
                                imageTypeResolve( imageType( chunk ) );
                            } );
                        } );
                    } );
                } else {
                    imageTypePromise = new Promise( ( imageTypeResolve ) => {
                        http.get( post.urlLinkOrImage, ( response ) => {
                            response.once( 'data', ( chunk ) => {
                                response.destroy();
                                imageTypeResolve( imageType( chunk ) );
                            } );
                        } );
                    } );
                }

                imageTypePromise
                    .then( ( imageTypeResult ) => {
                        let postContent = `<a href="${ post.urlLinkOrImage }">${ post.urlLinkOrImage }</a>`;

                        if ( ALLOWED_IMAGE_EMBEDS.indexOf( imageTypeResult.ext ) > -1 ) {
                            postContent = `<img src="${ post.urlLinkOrImage }">`;
                        }
                        resolve( postContent );

                        return true;
                    } )
                    .catch( ( imageError ) => {
                        reject( imageError );
                    } );
            }

            return false;
        } );
    }

    async loadThread ( threadId ) {
        const threadUrl = `${ this.threadUrl.replace( '{threadId}', threadId ) }`;
        let page = false;

        try {
            page = await this.load.get( threadUrl, {
                headers: {
                    'X-API-KEY': config.bungienet.apiKey,
                },
                isJSON: true,
            } );
        } catch ( pageLoadError ) {
            console.error( pageLoadError );
        }

        return page;
    }

    async getPost ( threadId ) {
        let threadData = false;

        try {
            threadData = await this.loadThread( threadId );
        } catch ( threadLoadError ) {
            console.error( threadLoadError );
        }
        const post = new Post();

        if ( !threadData || !threadData.Response ) {
            // console.log( threadId, threadData );
            if ( threadData.errorCode ) {
                console.error( `Thread ${ threadId } returned error code ${ threadData.errorCode } - ${ threadData.Message }` );
            }

            return false;
        }

        if ( threadData.Response.recruitmentDetails.length > 0 ) {
            // Probably a recruitment, let's skip that

            return false;
        }

        const topicData = threadData.Response.results[ 0 ];
        const parentData = threadData.Response.results[ threadData.Response.results.length - 2 ];
        const postData = threadData.Response.results[ threadData.Response.results.length - 1 ];
        let postContent;

        try {
            postContent = await this.getPostContent( postData );
        } catch ( postLoadError ) {
            console.error( postLoadError );
        }

        if ( threadData.Response.results.length > 1 ) {
            let parentContent;

            try {
                parentContent = await this.getPostContent( parentData );
            } catch ( parentLoadError ) {
                console.error( parentLoadError );
            }

            post.text = `<blockquote>
                    <div class="quoteauthor">
                        Originally posted by
                        <b>
                            <a href="${ this.getFullPostUrl( parentData.postId ) }">
                                ${ this.getAuthorNick( threadData.Response.authors, parentData ) }
                            </a>
                        </b>
                    </div>
                    ${ parentContent }
                </blockquote>
                ${ postContent }`;
        } else {
            post.text = postContent;
        }

        post.topicTitle = topicData.subject;
        post.topicUrl = this.getFullPostUrl( topicData.postId );
        post.timestamp = Math.floor( Date.parse( topicData.creationDate ) / MILLISECONDS_PER_SECOND );
        post.url = this.getFullPostUrl( postData.postId );

        return post;
    }

    async loadRecentPosts () {
        const activityUrl = `${ this.userActivityUrl.replace( '{userId}', this.userId ) }`;
        let activities;

        try {
            activities = await this.load.get( activityUrl, {
                headers: {
                    'X-API-KEY': config.bungienet.apiKey,
                },
                isJSON: true,
            } );
        } catch ( activitiesError ) {
            console.error( activitiesError );
        }

        const posts = [];

        if ( activities.ErrorCode > 1 ) {
            throw new Error( `Failed for user ${ this.userId } ${ activityUrl } - ${ activities.Message }` );
        }

        for ( let i = 0; i < activities.Response.results.length; i = i + 1 ) {
            const currentActivity = activities.Response.results[ i ].activity;
            let post = false;

            try {
                post = await this.getPost( currentActivity.relatedItemId );
            } catch ( getPostError ) {
                console.error( getPostError );
            }

            if ( post ) {
                // console.log( post );
                posts.push( post );
            }
        }

        return posts;
    }
}

module.exports = BungieNet;
