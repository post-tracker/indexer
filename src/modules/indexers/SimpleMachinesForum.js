const cheerio = require( 'cheerio' );
const moment = require( 'moment' );

// const Post = require( './Post.js' );
const load = require( '../load.js' );

class SimpleMachinesForum {
    constructor ( forumBase, user ) {
        this.forumBase = forumBase;
        this.profileBase = 'index.php?action=profile;area=showposts;u=';
        this.identifier = 'SimpleMachinesForum';

        this.user = user;

        this.postList = [];
    }

    async loadRecentPosts () {
        const page = await load.get( `${ this.forumBase }${ this.profileBase }${ this.user.accounts[ this.identifier ] }` );
        const $ = cheerio.load( page );
        const posts = [];

        $( '.topic' ).each( ( index, element ) => {
            const $element = $( element );
            const $topicLink = $element.find( 'a' ).eq( 1 );
            const postData = {};

            const timestampMatches = $element
                .find( 'span.smalltext' )
                .text()
                .match( /on: (.+?).{2}$/m );

            // March 09, 2017, 05:53:06 PM
            // Today at 05:53:06 PM
            postData.timestamp = moment( timestampMatches[ 1 ].replace( 'Today at', '' ), [
                'MMMM DD, YYYY, h:m:s a',
                'H:m:s a',
            ] ).unix();

            postData.content = $element
                .find( 'div.list_posts' )
                .html()
                .trim();

            postData.source = this.identifier;

            postData.url = $topicLink.attr( 'href' );
            postData.topic = $topicLink.text().replace( /^Re: /, '' );
            postData.topicUrl = $topicLink.attr( 'href' ).match( /(.+?topic=\d+)/ )[ 1 ];

            posts.push( Object.assign(
                {},
                this.user,
                postData
            ) );
        } );

        return posts;
    }
}

module.exports = SimpleMachinesForum;
