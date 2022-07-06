const { URL } = require( 'url' );

const cheerio = require( 'cheerio' );
const moment = require( 'moment' );

const Post = require( '../Post.js' );

class BattleNet {
    constructor ( userId, indexerConfig, load ) {
        this.profileBase = '/search?a=';

        this.endpoint = indexerConfig.endpoint;
        this.userId = userId;

        this.load = load;
    }

    async loadRecentPosts () {
        const postsUrl = new URL( `${ this.endpoint }${ this.profileBase }${ encodeURIComponent( this.userId ) }` );
        let page;

        try {
            page = await this.load.get( postsUrl );
        } catch ( pageLoadError ) {
            console.error( pageLoadError );
        }
        const page$ = cheerio.load( page );
        const posts = [];
        const postElements = page$( '.Post--searchPage' );

        for ( let i = 0; i < postElements.length; i = i + 1 ) {
            const post = new Post();
            let postPage;
            let $element = page$( postElements[ i ] );
            const fullUrl = new URL( `${ postsUrl.origin }${ $element.find( 'a' ).first().attr( 'href' ) }` );

            post.topicTitle = $element
                .find( '.Post-body--topicTitle' )
                .text()
                .trim();
            post.section = $element
                .find( '.Post-body--forumName' )
                .text()
                .trim();
            post.topicUrl = `${ fullUrl.origin }${ fullUrl.pathname }`;
            post.url = fullUrl.toString();

            try {
                postPage = await this.load.get( fullUrl.toString(), {
                    permanent: true,
                } );
            } catch ( pageLoadError ) {
                console.error( pageLoadError );

                return true;
            }
            const $ = cheerio.load( postPage );
            $element = $( fullUrl.hash );
            const timestampText = $element
                .find( '.Timestamp-details a' )
                .attr( 'data-tooltip-content' );

            post.text = $element
                .find( '.TopicPost-bodyContent' )
                .html()
                .trim();

            post.timestamp = moment( timestampText, 'MM/DD/YYYY hh:mm a' ).unix();

            posts.push( post );
        };

        return posts;
    }
}

module.exports = BattleNet;
