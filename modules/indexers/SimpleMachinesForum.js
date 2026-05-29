const cheerio = require( 'cheerio' );
const moment = require( 'moment' );

const Post = require( '../Post.js' );

class SimpleMachinesForum {
    constructor ( userId, indexerConfig, load ) {
        this.forumBase = indexerConfig.endpoint;
        this.profileBase = 'index.php?action=profile;area=showposts;u=';

        this.userId = userId;
        this.load = load;
    }

    async loadRecentPosts () {
        const url = `${ this.forumBase }${ this.profileBase }${ this.userId }`;
        let page = false;

        try {
            page = await this.load.get( url );
        } catch ( pageLoadError ) {
            console.error( `[SimpleMachinesForum] ${ this.userId } load threw: ${ pageLoadError.message }` );
        }

        if ( !page ) {
            return [];
        }

        const $ = cheerio.load( page );
        const posts = [];

        const serverTime = moment( $( '#time' ).text().trim(), 'MMMM DD, YYYY, h:m:s a' ).seconds( 0 ).milliseconds( 0 );
        const remoteDiff = Math.floor( moment().seconds( 0 ).milliseconds( 0 ).diff( serverTime ) / 1000 );

        $( '.topic' ).each( ( index, element ) => {
            const post = new Post();
            const $element = $( element );
            const $topicLink = $element.find( 'a' ).eq( 1 );

            const timestampMatches = $element
                .find( 'span.smalltext' )
                .text()
                .match( /on: (.+?).{2}$/m );

            // March 09, 2017, 05:53:06 PM
            // Today at 05:53:06 PM
            post.timestamp = moment( timestampMatches[ 1 ].replace( 'Today at', '' ), [
                'MMMM DD, YYYY, h:m:s a',
                'H:m:s a',
            ] ).unix() + remoteDiff;

            if ( post.timestamp > Math.floor( Date.now() / 1000 ) ) {
                console.log( timestampMatches[ 1 ] );
            }

            post.text = $element
                .find( 'div.list_posts' )
                .html()
                .trim();

            post.url = $topicLink.attr( 'href' );
            post.topicTitle = $topicLink.text().replace( /^Re: /, '' );
            post.topicUrl = $topicLink.attr( 'href' ).match( /(.+?topic=\d+)/ )[ 1 ];

            posts.push( post );
        } );

        return posts;
    }
}

module.exports = SimpleMachinesForum;
