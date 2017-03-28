const cheerio = require( 'cheerio' );

const load = require( '../load.js' );

const MILLISECONDS_PER_SECOND = 1000;

class InvisionPowerboard {
    constructor ( providerConfig, userData, userIdentifier ) {
        this.forumBase = providerConfig.endpoint;
        this.profileBase = '/profile/{{userId}}/?do=content&type=forums_topic_post&change_section=1';
        this.identifier = 'InvisionPowerboard';

        this.user = userData;
        this.userIdentifier = userIdentifier;

        this.postList = [];
    }

    async loadRecentPosts () {
        const url = `${ this.forumBase }${ this.profileBase.replace( '{{userId}}', this.userIdentifier ) }`;
        const page = await load.get( url );
        const $ = cheerio.load( page );
        const posts = [];

        $( 'div.ipsComment_content' ).each( ( index, element ) => {
            const $element = $( element );
            const fullUrl = $element
                .find( 'h3' )
                .first()
                .find( 'a' )
                .attr( 'href' );

            const post = Object.assign(
                {},
                this.user,
                {
                    content: $element
                        .find( '.ipsType_richText' )
                        .html()
                        .trim(),
                    source: this.identifier,
                    timestamp: Date.parse( $element
                            .find( 'time' )
                            .attr( 'datetime' )
                        ) / MILLISECONDS_PER_SECOND,
                    topic: $element
                        .find( 'h3' )
                        .first()
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
