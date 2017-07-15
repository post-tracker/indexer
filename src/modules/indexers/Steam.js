const cheerio = require( 'cheerio' );
const moment = require( 'moment' );
const sha1 = require( 'sha1' );

const Post = require( '../Post.js' );

class Steam {
    constructor ( userIdentifier, providerConfig, hashes, load ) {
        this.apiBase = 'http://steamcommunity.com';

        this.userIdentifier = userIdentifier;
        this.hashes = hashes;

        this.postList = [];
        this.load = load;
    }

    async loadRecentPosts () {
        let url = `${ this.apiBase }/id/${ this.userIdentifier }/posthistory/`;

        if ( !isNaN( this.userIdentifier ) ) {
            url = `${ this.apiBase }/profiles/${ this.userIdentifier }/posthistory/`;
        }

        const postsHTML = await this.load.get( url );
        const $ = cheerio.load( postsHTML );
        const posts = [];

        $( 'div.post_searchresult' ).each( ( index, element ) => {
            const post = new Post();
            const $post = $( element );

            const forumLink = $post.find( 'a.searchresult_forum_link' ).attr( 'href' );

            post.timestamp = $post
                .find( 'div.searchresult_timestamp' )
                .text()
                .trim();

            if ( post.timestamp.indexOf( 'Just now' ) > -1 ) {
                post.timestamp = moment().unix();
            } else if ( post.timestamp.indexOf( 'ago' ) > -1 ) {
                const numberOffset = post.timestamp.match( /\d+/g )[ 1 ];

                if ( post.timestamp.indexOf( 'hour' ) > -1 ) {
                    post.timestamp = moment()
                        .subtract( Number( numberOffset ), 'hours' )
                        .unix();
                } else if ( post.timestamp.indexOf( 'minute' ) > -1 ) {
                    post.timestamp = moment()
                        .subtract( Number( numberOffset ), 'minutes' )
                        .unix();
                }
            } else {
                post.timestamp = moment( post.timestamp, [
                    'D MMM, YYYY @ h:ma',
                    'D MMM @ h:ma',
                ] ).unix();
            }

            if ( Number.isNaN( post.timestamp ) ) {
                const timeString = $post
                    .find( 'div.searchresult_timestamp' )
                    .text()
                    .trim();

                console.error( `Unable to parse Steam time ${ timeString }` );
            }

            post.url = $post
                .find( 'div.post_searchresult_simplereply' )
                .attr( 'onclick' )
                .replace( 'window.location=', '' )
                .replace( /'/g, '' );

            if ( this.hashes.includes( sha1( post.url ) ) ) {
                return true;
            }

            post.topicTitle = $post
                .find( 'a.forum_topic_link' )
                .text();

            post.topicUrl = $post
                .find( 'a.forum_topic_link' )
                .attr( 'href' );

            post.text = $post
                .find( 'div.post_searchresult_simplereply' )
                .html()
                .trim();

            // Fix some links pointing to topic id's with #
            post.text = post.text.replace( /href="#(.+?)"/gim, `href="${ post.topicUrl }#$1"` );

            let sectionUrlMatches = forumLink.match( /steamcommunity\.com\/app\/(\d*)\/discussions\/\d+\//i );

            if ( !sectionUrlMatches || !sectionUrlMatches[ 1 ] ) {
                sectionUrlMatches = forumLink.match( /steamcommunity\.com\/workshop\/discussions\/\?appid=(\d*)/i );
            }

            if ( !sectionUrlMatches || !sectionUrlMatches[ 1 ] ) {
                post.section = false;
            } else {
                post.section = sectionUrlMatches[ 1 ];
            }

            posts.push( post );

            return true;
        } );

        return posts;
    }
}

module.exports = Steam;
