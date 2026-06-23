const cheerio = require( 'cheerio' );

const Post = require( '../Post.js' );
const SteamFeed = require( './SteamFeed.js' );

// SteamID64 = this base + the 32-bit account id exposed as `data-miniprofile`.
const STEAM_ID64_BASE = 76561197960265728n;

// The list HTTP is cached by load.get (60s TTL), but parsing every page-1 thread
// once per tracked account each cycle is wasteful. Memoize the parsed dev posts
// per appId for one run interval so a game's accounts share the parse too.
const PARSE_MEMO_TTL = 60000;
const parseMemo = new Map();

class SteamDiscussions {
    constructor ( userIdentifier, providerConfig, load ) {
        this.userId = userIdentifier;
        // The discussions list lives at /app/<numeric-appId>/ and a vanity slug
        // redirects away, so prefer the explicit numeric `appId` when set. It
        // falls back to allowedSections[0], which IS the numeric id for games
        // without a custom community URL (the announcements feed and discussions
        // share one id there); only custom-URL games need the separate appId.
        this.section = providerConfig.appId
            || ( providerConfig.allowedSections && providerConfig.allowedSections[ 0 ] );
        this.load = load;
    }

    static miniProfileToSteamId64 ( miniProfile ) {
        try {
            return ( STEAM_ID64_BASE + BigInt( miniProfile ) ).toString();
        } catch ( conversionError ) {
            return false;
        }
    }

    // Page 1 of the discussions list, sorted by last activity. Returns the
    // thread permalink + title for each topic (pinned topics included).
    static async loadThreads ( appId, load ) {
        const listUrl = `https://steamcommunity.com/app/${ appId }/discussions/`;
        let listHtml = false;

        try {
            listHtml = await load.get( listUrl );
        } catch ( listError ) {
            console.error( `[SteamDiscussions] failed to load ${ listUrl }: ${ listError.message }` );
        }

        if ( !listHtml ) {
            return [];
        }

        const $ = cheerio.load( listHtml );
        const threads = [];
        const seen = new Set();

        $( '.forum_topic' ).each( ( index, element ) => {
            const $topic = $( element );
            const url = $topic.find( 'a.forum_topic_overlay' ).attr( 'href' );

            if ( !url || seen.has( url ) ) {
                return;
            }

            seen.add( url );

            // Drop the "PINNED:" label span before reading the title text.
            const $name = $topic.find( '.forum_topic_name' ).clone();

            $name.find( '.forum_topic_label' ).remove();

            threads.push( {
                title: $name.text().replace( /\s+/g, ' ' ).trim(),
                url: url,
            } );
        } );

        return threads;
    }

    // Every developer-badged post (OP + replies) across page-1 threads for an
    // appId, with the author resolved to a SteamID64. Not filtered to any
    // account, so both the per-account crawl and the untracked-dev check reuse it.
    static async extractDevPosts ( appId, load ) {
        const memo = parseMemo.get( appId );

        if ( memo && memo.expires > Date.now() ) {
            return memo.posts;
        }

        const threads = await SteamDiscussions.loadThreads( appId, load );
        const devPosts = [];

        for ( let i = 0; i < threads.length; i = i + 1 ) {
            let threadHtml = false;

            try {
                threadHtml = await load.get( threads[ i ].url );
            } catch ( threadError ) {
                console.error( `[SteamDiscussions] failed to load ${ threads[ i ].url }: ${ threadError.message }` );
            }

            if ( !threadHtml ) {
                continue;
            }

            try {
                SteamDiscussions.parseThread( threadHtml, threads[ i ], appId, devPosts );
            } catch ( parseError ) {
                console.error( `[SteamDiscussions] parse failed for ${ threads[ i ].url }: ${ parseError.message }` );
            }
        }

        parseMemo.set( appId, {
            expires: Date.now() + PARSE_MEMO_TTL,
            posts: devPosts,
        } );

        return devPosts;
    }

    // Pull the OP and every reply authored by a developer (Steam's own
    // `commentthread_author_developer` badge) out of a single thread page.
    static parseThread ( threadHtml, thread, appId, devPosts ) {
        const $ = cheerio.load( threadHtml );

        const pushPost = ( { miniProfile, timestamp, author, text, url } ) => {
            const steamId64 = SteamDiscussions.miniProfileToSteamId64( miniProfile );
            const content = ( text || '' ).replace( /\s+/g, ' ' ).trim();

            if ( !steamId64 || !content ) {
                return;
            }

            const post = new Post();

            post.steamId64 = steamId64;
            post.author = ( author || '' ).trim();
            post.text = content;
            post.timestamp = Number( timestamp );
            post.topicTitle = thread.title || content.slice( 0, 80 );
            post.topicUrl = thread.url;
            post.url = url;
            post.section = appId;

            devPosts.push( post );
        };

        // Original post
        const $op = $( '.forum_op' ).first();

        if ( $op.length && $op.find( '.forum_op_author' ).hasClass( 'commentthread_author_developer' ) ) {
            pushPost( {
                author: $op.find( '.forum_op_author' ).text(),
                miniProfile: $op.find( '[data-miniprofile]' ).first().attr( 'data-miniprofile' ),
                text: $op.find( '.content' ).first().html(),
                timestamp: $op.find( '[data-timestamp]' ).first().attr( 'data-timestamp' ),
                url: thread.url,
            } );
        }

        // Replies
        $( '.commentthread_comment' ).each( ( index, element ) => {
            const $comment = $( element );

            if ( !$comment.find( '.commentthread_author_link' ).hasClass( 'commentthread_author_developer' ) ) {
                return;
            }

            const commentId = ( $comment.attr( 'id' ) || '' ).replace( 'comment_', '' );

            pushPost( {
                author: $comment.find( '.commentthread_author_link' ).text(),
                miniProfile: $comment.find( '[data-miniprofile]' ).first().attr( 'data-miniprofile' ),
                text: $comment.find( '.commentthread_comment_text' ).html(),
                timestamp: $comment.find( '[data-timestamp]' ).first().attr( 'data-timestamp' ),
                url: commentId ? `${ thread.url }#c${ commentId }` : thread.url,
            } );
        } );
    }

    async loadRecentPosts () {
        if ( !this.section ) {
            return [];
        }

        const steamId64 = await SteamFeed.resolveSteamId64( this.userId, this.load );

        if ( !steamId64 ) {
            console.warn( `[SteamDiscussions] could not resolve SteamID64 for ${ this.userId }, skipping ${ this.section }` );

            return [];
        }

        let devPosts = [];

        try {
            devPosts = await SteamDiscussions.extractDevPosts( this.section, this.load );
        } catch ( crawlError ) {
            console.error( crawlError );

            return [];
        }

        return devPosts.filter( ( post ) => {
            return post.steamId64 === steamId64;
        } );
    }
}

module.exports = SteamDiscussions;
