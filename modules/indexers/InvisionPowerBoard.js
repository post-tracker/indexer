const url = require( 'url' );

const cheerio = require( 'cheerio' );

const Post = require( '../Post.js' );

const MILLISECONDS_PER_SECOND = 1000;

class InvisionPowerBoard {
    constructor ( userId, indexerConfig, load ) {
        this.profileBase = '/profile/{{userId}}/?do=content&type=forums_topic_post&change_section=1';

        this.endpoint = indexerConfig.endpoint;
        this.userId = userId;

        this.load = load;
    }
    
    async loadRecentPosts () {
        if ( url.parse( this.endpoint ).path ) {
            return await this.loadStreamPosts();
        }
        
        return await this.loadProfilePosts();
    }

    async loadProfilePosts () {
        const profileUrl = `${ this.endpoint }${ this.profileBase.replace( '{{userId}}', this.userId ) }`;
        let page;

        try {
            page = await this.load.get( profileUrl );
        } catch ( pageLoadError ) {
            console.error( pageLoadError );
        }
        const $ = cheerio.load( page );
        const posts = [];

        $( 'article.ipsComment' ).each( ( index, element ) => {
            const post = new Post();
            const $element = $( element );
            const $title = $element.find( 'h3' ).first();
            const fullUrl = $title
                .find( 'a' )
                .attr( 'href' );

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

        return posts;
    }
    
    async loadStreamPosts () {
        let page;

        try {
            page = await this.load.get( this.endpoint );
        } catch ( pageLoadError ) {
            console.error( pageLoadError );

            return false;
        }
        
        const $ = cheerio.load( page );
        const posts = [];

        $( 'li.ipsStreamItem' ).each( ( index, element ) => {
            const $post = $( element );
            const user = $post
                .find( '.ipsUserPhoto img' )
                .attr( 'alt' );
            
            if ( user !== this.userId ) {
                return false;
            }
            
            const post = new Post();
            
            post.url = $post
                .find( 'h2' )
                .first()
                .find( 'a' )
                .attr( 'href' );

            post.section = $post
                .find( 'p.ipsStreamItem_status a' )
                .text()
                .trim();
                
            post.text = $post
                .find( '.ipsType_richText div[data-ipstruncate]' )
                .html()
                .trim();
                
            post.topicTitle = $post
                .find( '.ipsStreamItem_title a' )
                .text()
                .trim();
                
            post.topicUrl = post.url.substr( 0, post.url.lastIndexOf( '/' ) + 1 );
        
            post.timestamp = Math.floor( Date.parse( $post
                .find( 'time' )
                .attr( 'datetime' )
            ) / MILLISECONDS_PER_SECOND );
                
            posts.push( post );
        } );

        return posts;
    }
}

module.exports = InvisionPowerBoard;
