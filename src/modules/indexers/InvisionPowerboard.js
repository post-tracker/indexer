const cheerio = require( 'cheerio' );

const load = require( '../load.js' );

const MILLISECONDS_PER_SECOND = 1000;

class InvisionPowerboard {
    constructor ( forumBase, userData, userIdentifier ) {
        this.forumBase = forumBase;
        this.profileBase = '/profile/';
        this.identifier = 'InvisionPowerboard';

        this.user = userData;
        this.userIdentifier = userIdentifier;

        this.postList = [];
    }

    async loadRecentPosts () {
        const page = await load.get( `${ this.forumBase }${ this.profileBase }${ this.userIdentifier }` );
        const $ = cheerio.load( page );
        const posts = [];

        $( '#elProfileActivityOverview li.ipsStreamItem_contentBlock' ).each( ( index, element ) => {
            const $element = $( element );
            const fullUrl = $element
                .find( 'h2 a' )
                .attr( 'href' );

            const post = Object.assign(
                {},
                this.user,
                {
                    content: $element
                        .find( '.ipsType_richText > div' )
                        .html()
                        .trim(),
                    source: this.identifier,
                    timestamp: Date.parse( $element
                            .find( 'time' )
                            .attr( 'datetime' )
                        ) / MILLISECONDS_PER_SECOND,
                    topic: $element
                        .find( 'h2' )
                        .text()
                        .trim(),
                    topicUrl: fullUrl
                        .substr( 0, fullUrl.lastIndexOf( '/' ) + 1 ),
                    url: fullUrl,
                }
            );

            posts.push( post );
        } );

        return posts;
    }
}

module.exports = InvisionPowerboard;
