const cheerio = require( 'cheerio' );
const sha1 = require( 'sha1' );

const Post = require( '../Post.js' );

const MILLISECONDS_PER_SECOND = 1000;

class InvisionPowerBoard {
    constructor ( userId, indexerConfig, hashes, load ) {
        this.profileBase = '/profile/{{userId}}/?do=content&type=forums_topic_post&change_section=1';

        this.endpoint = indexerConfig.endpoint;
        this.userId = userId;
        this.postHashes = hashes;

        this.load = load;
    }

    loadRecentPosts () {
        return new Promise( async ( resolve, reject ) => {
            const url = `${ this.endpoint }${ this.profileBase.replace( '{{userId}}', this.userId ) }`;
            const page = await this.load.get( url );
            const $ = cheerio.load( page );
            const posts = [];

            $( 'article.ipsComment' ).each( ( index, element ) => {
                const post = new Post();
                const $element = $( element );
                const $title = $element.find( 'h3' ).first();
                const fullUrl = $title
                    .find( 'a' )
                    .attr( 'href' );

                if ( this.postHashes.includes( sha1( fullUrl ) ) ) {
                    return false;
                }

                post.section = $element
                    .find( 'p.ipsType_normal a' )
                    .text()
                    .trim();
                post.topicTitle = $title
                    .text()
                    .trim();
                post.topicUrl = fullUrl.substr( 0, fullUrl.lastIndexOf( '/' ) + 1 );
                post.text = $element
                    .find( '.ipsType_richText' )
                    .html()
                    .trim();
                post.timestamp = Math.floor( Date.parse( $element
                    .find( 'time' )
                    .attr( 'datetime' )
                ) / MILLISECONDS_PER_SECOND );
                post.url = fullUrl;
                posts.push( post );

                return true;
            } );

            resolve( posts );
        } );
    }
}

module.exports = InvisionPowerBoard;
