const cheerio = require( 'cheerio' );

const load = require( '../load.js' );
const Post = require( '../Post.js' );
const postIndex = require( '../postindexed.js' );

const MILLISECONDS_PER_SECOND = 1000;

class InvisionPowerboard {
    constructor () {
        this.profileBase = '/profile/{{userId}}/content/';
        this.identifier = 'InvisionPowerboard';
    }

    loadRecentPosts ( user, config ) {
        return new Promise( async ( resolve, reject ) => {
            const url = `${ config.endpoint }${ this.profileBase.replace( '{{userId}}', user.identifier ) }`;
            const page = await load.get( url );
            const $ = cheerio.load( page );
            const posts = [];

            const postPromises = [];

            $( 'div.ipsStreamItem_container' ).each( ( index, element ) => {
                postPromises.push( new Promise( ( postResolve, postReject ) => {
                    const post = Object.assign( new Post(), user );
                    const $element = $( element );
                    const $title = $element.find( 'h2' ).first();
                    const fullUrl = $title
                        .find( 'a' )
                        .attr( 'href' );

                    postIndex.exists( fullUrl )
                        .then( ( exists ) => {
                            if ( exists ) {
                                postResolve();

                                return false;
                            }

                            postIndex.add( fullUrl );
                            post.game = config.game;
                            post.topicTitle = $title
                                .text()
                                .trim();
                            post.topicUrl = fullUrl.substr( 0, fullUrl.lastIndexOf( '/' ) + 1 );
                            post.text = $element
                                .find( '.ipsStreamItem_snippet' )
                                .html()
                                .trim();
                            post.source = this.identifier;
                            post.timestamp = Date.parse( $element
                                .find( 'time' )
                                .attr( 'datetime' )
                            ) / MILLISECONDS_PER_SECOND;
                            post.url = fullUrl;
                            posts.push( post );
                            postResolve();

                            return true;
                        } )
                        .catch( ( error ) => {
                            postReject( error );
                        } );
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

module.exports = InvisionPowerboard;
