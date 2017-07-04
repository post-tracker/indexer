const moment = require( 'moment' );
const sha1 = require( 'sha1' );

const Post = require( '../Post.js' );

class Twitter {
    constructor ( userId, indexerConfig, hashes, load ) {
        this.apiPath = 'https://api.twitter.com/1.1';
        this.userTweetsPath = '/statuses/user_timeline';
        this.singleTweetPath = '/statuses/show';

        this.postList = [];

        this.postHashes = hashes;
        this.userId = userId;
        this.load = load;

        this.parsers = {
            hashtags: ( tag ) => {
                return {
                    href: `https://twitter.com/search/%23${ tag.text }`,
                    search: `#${ tag.text }`,
                    text: `#${ tag.text }`,
                };
            },
            media: ( media ) => {
                if ( media.type === 'photo' ) {
                    return {
                        href: media.expanded_url,
                        search: media.url,
                        src: `${ media.media_url_https }:small`,
                        type: 'photo',
                    };
                }

                if ( media.type === 'youtube' || media.type === 'vimeo' || media.type === 'vine' ) {
                    return {
                        service: `video${ media.type }`,
                        src: media.media_url_https,
                        type: 'iframe',
                    };
                }

                return false;
            },
            urls: ( url ) => {
                return {
                    href: url.expanded_url,
                    search: url.url,
                    text: url.display_url,
                };
            },
            // eslint-disable-next-line camelcase
            user_mentions: ( mention ) => {
                return {
                    href: `https://twitter.com/${ mention.screen_name }`,
                    search: `@${ mention.screen_name }`,
                    text: `@${ mention.screen_name }`,
                };
            },
        };
    }

    replaceString ( tweetText, replaceData ) {
        let replaceString;
        let replaceRegex;

        switch ( replaceData.type ) {
            case 'photo':
                replaceString = `<div><a href="${ replaceData.href }"><img src="${ replaceData.src }" /></a></div>`;
                replaceRegex = new RegExp( replaceData.search );

                break;
            default:
                if ( replaceData.type ) {
                    console.log( tweetText, replaceData );

                    return tweetText;
                }

                replaceString = `<a href="${ replaceData.href }">${ replaceData.text }</a>`;
                replaceRegex = new RegExp( replaceData.search );
        }

        return tweetText.replace( replaceRegex, replaceString );
    }

    parseEntity ( tweetText, entityType, entityData ) {
        let updatedTweetText = tweetText;

        for ( let i = 0; i < entityData.length; i = i + 1 ) {
            if ( !this.parsers[ entityType ] ) {
                console.error( `No parser added for type ${ entityType }` );

                return updatedTweetText;
            }

            updatedTweetText = this.replaceString( updatedTweetText, this.parsers[ entityType ]( entityData[ i ] ) );
        }

        return updatedTweetText;
    }

    async getParentTweet ( tweetId ) {
        const parentTweetData = await this.getTweet( tweetId );

        if ( !parentTweetData ) {
            return false;
        }

        return `<blockquote><div><b><a href="https://twitter.com/${ parentTweetData.user.screen_name }/status/${ parentTweetData.id_str }/">@${ parentTweetData.user.screen_name }</a></b></div>${ this.tweetToHTML( parentTweetData ) }</blockquote>`;
    }

    async getTweet ( tweetId ) {
        return await this.load.get( this.singleTweetPath, {
            isJSON: true,
            namespace: 'https://api.twitter.com/1.1',
            parameters: {
                id: tweetId,
                // eslint-disable-next-line camelcase
                tweet_mode: 'extended',
            },
            permanent: true,
            provider: 'Twitter',
        } );
    }

    tweetToHTML ( tweet ) {
        let tweetText = tweet.full_text || tweet.text;

        for ( const key in tweet.entities ) {
            if ( tweet.entities[ key ].length <= 0 ) {
                continue;
            }

            tweetText = this.parseEntity( tweetText, key, tweet.entities[ key ] );
        }

        return tweetText;
    }

    async loadRecentPosts () {
        const tweets = await this.load.get( `${ this.userTweetsPath }`, {
            isJSON: true,
            namespace: 'https://api.twitter.com/1.1',
            parameters: {
                count: 50,
                // eslint-disable-next-line camelcase
                include_rts: false,
                // eslint-disable-next-line camelcase
                screen_name: this.userId,
                // eslint-disable-next-line camelcase
                tweet_mode: 'extended',
            },
            provider: 'Twitter',
        } );
        const postList = [];

        for ( let tweetIndex = 0; tweetIndex < tweets.length; tweetIndex = tweetIndex + 1 ) {
            const post = new Post();

            post.url = `https://twitter.com/${ tweets[ tweetIndex ].user.screen_name }/status/${ tweets[ tweetIndex ].id_str }/`;

            if ( this.postHashes.indexOf( sha1( post.url ) ) > -1 ) {
                continue;
            }

            post.text = this.tweetToHTML( tweets[ tweetIndex ] );

            if ( tweets[ tweetIndex ].in_reply_to_status_id_str ) {
                post.text = `${ await this.getParentTweet( tweets[ tweetIndex ].in_reply_to_status_id_str ) }${ post.text }`;
            }

            post.timestamp = moment( tweets[ tweetIndex ].created_at, 'ddd MMM DD, HH:mm:ss ZZ YYYY' ).unix();
            post.topicTitle = 'tweeted';

            postList.push( post );
        }

        return postList;
    }
}

module.exports = Twitter;
