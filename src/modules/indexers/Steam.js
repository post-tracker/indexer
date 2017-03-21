const cheerio = require( 'cheerio' );
const moment = require( 'moment' );

// const Post = require( './Post.js' );
const load = require( '../load.js' );

class Steam {
    constructor ( user ) {
        this.apiBase = 'http://steamcommunity.com';
        this.identifier = 'Steam';

        this.user = user;

        this.postList = [];
    }

    async loadRecentPosts () {
        let url = `${ this.apiBase }/id/${ this.user.accounts[ this.identifier ] }/posthistory/`;

        if ( !isNaN( this.user.accounts[ this.identifier ] ) ) {
            url = `${ this.apiBase }/profiles/${ this.user.accounts[ this.identifier ] }/posthistory/`;
        }

        const postsHTML = await load.get( url );
        const $ = cheerio.load( postsHTML );
        const posts = [];

        $( 'div.post_searchresult' ).each( ( index, element ) => {
            const postData = {};
            const $post = $( element );

            console.log( 'post' );

            const forumLink = $post.find( 'a.searchresult_forum_link' ).attr( 'href' );

            postData.timestamp = $post
                .find( 'div.searchresult_timestamp' )
                .text();

            postData.timestamp = moment( postData.timestamp, [
                'D MMM, YYYY @ h:ma',
                'D MMM @ h:ma',
            ] ).unix();

            postData.url = $post
                .find( 'div.post_searchresult_simplereply' )
                .attr( 'onclick' )
                .replace( 'window.location=', '' )
                .replace( /'/g, '' );

            postData.topic = $post
                .find( 'a.forum_topic_link' )
                .text();

            postData.topicUrl = $post
                .find( 'a.forum_topic_link' )
                .attr( 'href' );

            postData.content = $post
                .find( 'div.post_searchresult_simplereply' )
                .html()
                .trim();

            postData.source = this.identifier;

            // Fix some links pointing to topic id's with #
            postData.content = postData.content.replace( /href="#(.+?)"/gim, `href="${ postData.topicUrl }#$1"` );

            let sectionUrlMatches = forumLink.match( /steamcommunity\.com\/app\/(\d*)\/discussions\/\d+\//i );

            if ( !sectionUrlMatches || !sectionUrlMatches[ 1 ] ) {
                sectionUrlMatches = forumLink.match( /steamcommunity\.com\/workshop\/discussions\/\?appid=(\d*)/i );
            }

            if ( !sectionUrlMatches || !sectionUrlMatches[ 1 ] ) {
                postData.section = false;
            } else {
                postData.section = sectionUrlMatches[ 1 ];
            }

            console.log( postData );

            posts.push( Object.assign(
                {},
                this.user,
                postData
            ) );
        } );

        return posts;
    }
}

module.exports = Steam;
