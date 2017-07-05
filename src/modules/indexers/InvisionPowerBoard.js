const cheerio = require( 'cheerio' );
const sha1 = require( 'sha1' );

const Post = require( '../Post.js' );

const MILLISECONDS_PER_SECOND = 1000;

class InvisionPowerBoard {
    constructor ( userId, indexerConfig, hashes, load ) {
        this.profileBase = '/profile/{{userId}}/content/';

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

            const postPromises = [];

            $( 'div.ipsStreamItem_container' ).each( ( index, element ) => {
                postPromises.push( new Promise( ( postResolve ) => {
                    const post = new Post();
                    const $element = $( element );
                    const $title = $element.find( 'h2' ).first();
                    const fullUrl = $title
                        .find( 'a' )
                        .attr( 'href' );

                    if ( this.postHashes.includes( sha1( fullUrl ) ) ) {
                        postResolve();

                        return false;
                    }

                    post.topicTitle = $title
                        .text()
                        .trim();
                    post.topicUrl = fullUrl.substr( 0, fullUrl.lastIndexOf( '/' ) + 1 );
                    post.text = $element
                        .find( '.ipsStreamItem_snippet' )
                        .html()
                        .trim();
                    post.timestamp = Math.floor( Date.parse( $element
                        .find( 'time' )
                        .attr( 'datetime' )
                    ) / MILLISECONDS_PER_SECOND );
                    post.url = fullUrl;
                    posts.push( post );
                    postResolve();

                    return true;
                } ) );
            } );

            Promise.all( postPromises )
                .then( () => {
                    resolve( posts );
                } )
                .catch( ( error ) => {
                    reject( error );
                } );
        } );
    }
}

module.exports = InvisionPowerBoard;
