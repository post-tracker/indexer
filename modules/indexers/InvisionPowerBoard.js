const url = require( 'url' );

const cheerio = require( 'cheerio' );

const Post = require( '../Post.js' );

const MILLISECONDS_PER_SECOND = 1000;

// Breadcrumb trail ends `... > <forum name> > <topic title>`, so the forum
// (which we store as the post's section) is the second-to-last crumb.
const SECTION_CRUMB_OFFSET = 2;

class InvisionPowerBoard {
    constructor ( userId, indexerConfig, load ) {
        this.profileBase = '/profile/{{userId}}/?do=content&type=forums_topic_post&change_section=1';

        this.endpoint = indexerConfig.endpoint;
        this.userId = userId;

        this.load = load;
    }

    async loadRecentPosts () {
        const path = url.parse( this.endpoint ).path;

        // A forum-node endpoint (`/forum/<id>-<slug>/`) is a topic listing rather
        // than an activity stream, so it needs its own crawl: find topics this
        // dev was the last to post in, then read their posts (incl. replies)
        // straight from the topic pages.
        if ( path.indexOf( '/forum/' ) === 0 ) {
            return await this.loadForumNodePosts();
        }

        if ( path !== '/' ) {
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
            console.error( `[InvisionPowerBoard] ${ this.userId } load threw: ${ pageLoadError.message }` );
        }

        if ( !page ) {
            return [];
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
            post.text = ( $element.find( '.ipsType_richText' ).html() || '' ).trim();
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
            console.error( `[InvisionPowerBoard] ${ this.userId } load threw: ${ pageLoadError.message }` );

            return [];
        }

        if ( !page ) {
            return [];
        }

        const $ = cheerio.load( page );
        const posts = [];

        $( 'li.ipsStreamItem' ).each( ( index, element ) => {
            const $post = $( element );
            const user = $post
                .find( '.ipsUserPhoto img' )
                .attr( 'alt' );

            if ( user !== this.userId ) {
                return true;
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

            const streamHtml = $post.find( '.ipsType_richText div[data-ipstruncate]' ).html()
                || $post.find( '.ipsType_richText' ).html()
                || '';

            post.text = streamHtml.trim();

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

    async loadForumNodePosts () {
        let listing;

        try {
            listing = await this.load.get( this.endpoint );
        } catch ( listingError ) {
            console.error( `[InvisionPowerBoard] ${ this.userId } node listing threw: ${ listingError.message }` );
        }

        if ( !listing ) {
            return [];
        }

        const $ = cheerio.load( listing );
        const wantedUser = this.userId.toLowerCase();
        const topicUrls = [];

        // Only follow topics this dev was last to post in. The forum anonymises
        // regular members (TarkovCitizen_xxxxx), so a known dev being the last
        // poster is what separates dev threads from community noise.
        $( 'li.ipsDataItem' ).each( ( index, element ) => {
            const $element = $( element );
            const lastPoster = $element.find( '.ipsDataItem_lastPoster img' ).attr( 'alt' );

            if ( !lastPoster || lastPoster.toLowerCase() !== wantedUser ) {
                return true;
            }

            const topicUrl = ( $element.find( '.ipsDataItem_title a' ).last()
                .attr( 'href' ) || '' )
                .split( '?' )[ 0 ]
                .split( '#' )[ 0 ];

            if ( topicUrl && topicUrls.indexOf( topicUrl ) === -1 ) {
                topicUrls.push( topicUrl );
            }

            return true;
        } );

        const posts = [];

        for ( let i = 0; i < topicUrls.length; i = i + 1 ) {
            // eslint-disable-next-line no-await-in-loop
            const topicPosts = await this.loadTopicPosts( topicUrls[ i ], wantedUser );

            posts.push( ...topicPosts );
        }

        // Newest first, so indexer.js's "already seen" early-exit works.
        posts.sort( ( postA, postB ) => {
            return postB.timestamp - postA.timestamp;
        } );

        return posts;
    }

    async loadTopicPosts ( topicUrl, wantedUser ) {
        let page;

        // getLastComment redirects to the topic's last page, where the most
        // recent posts (this dev's latest, since they're the last poster) live.
        try {
            page = await this.load.get( `${ topicUrl }?do=getLastComment` );
        } catch ( topicLoadError ) {
            console.error( `[InvisionPowerBoard] ${ this.userId } topic load threw: ${ topicLoadError.message }` );
        }

        if ( !page ) {
            return [];
        }

        const $ = cheerio.load( page );

        const breadcrumbs = $( 'nav.ipsBreadcrumb' )
            .first()
            .find( 'li' )
            .map( ( index, element ) => {
                return $( element ).text()
                    .replace( /\s+/g, ' ' )
                    .trim();
            } )
            .get()
            .filter( Boolean );

        const section = breadcrumbs.length >= SECTION_CRUMB_OFFSET
            ? breadcrumbs[ breadcrumbs.length - SECTION_CRUMB_OFFSET ]
            : '';
        const topicTitle = $( 'h1' ).first()
            .text()
            .replace( /\s+/g, ' ' )
            .trim();

        const posts = [];

        $( 'article.ipsComment' ).each( ( index, element ) => {
            const $element = $( element );
            const authorHref = $element.find( 'a[href*="/profile/"]' ).first()
                .attr( 'href' ) || '';
            const slugMatch = authorHref.match( /\/profile\/\d+-([^/]+)/ );
            const author = slugMatch
                ? decodeURIComponent( slugMatch[ 1 ] ).toLowerCase()
                : '';

            if ( author !== wantedUser ) {
                return true;
            }

            const text = ( $element.find( '.ipsComment_content .ipsType_richText' ).html() || '' ).trim();

            if ( !text ) {
                return true;
            }

            const post = new Post();

            post.text = text;
            post.topicTitle = topicTitle;
            post.section = section;
            post.topicUrl = topicUrl;
            post.url = $element.find( 'a[href*="findComment"]' ).first()
                .attr( 'href' ) || topicUrl;
            post.timestamp = Math.floor( Date.parse( $element.find( 'time' )
                .attr( 'datetime' ) ) / MILLISECONDS_PER_SECOND );

            posts.push( post );

            return true;
        } );

        return posts;
    }
}

module.exports = InvisionPowerBoard;
