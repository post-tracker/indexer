const cheerio = require( 'cheerio' );

const RSS = require( './RSS.js' );
const SteamFeed = require( './SteamFeed' );
const SteamDiscussions = require( './SteamDiscussions' );
const cache = require( '../cache.js' );
const ntfy = require( '../ntfy.js' );

const ATTRIBUTION_WINDOW_SECONDS = 30 * 24 * 60 * 60;

// Admin panel that handles the ?action=add-dev prefill deep link (same host and
// contract as the finder's notifications, so the one-click add behaves identically).
const ADMIN_HOST = 'https://post-admin.kokarn.com';

class Steam {
    constructor ( userIdentifier, providerConfig, load ) {
        this.feed = new SteamFeed( userIdentifier, providerConfig, load );
        this.discussions = new SteamDiscussions( userIdentifier, providerConfig, load );
        this.userIdentifier = userIdentifier;
    }

    async loadFromSource ( source ) {
        try {
            const posts = await source.loadRecentPosts();

            return posts || [];
        } catch ( sourceError ) {
            console.error( sourceError );

            return [];
        }
    }

    // Announcements (SteamFeed) and forum posts/replies (SteamDiscussions) are
    // complementary sources; a failure in one must not drop the other.
    async loadRecentPosts () {
        const [ announcements, forumPosts ] = await Promise.all( [
            this.loadFromSource( this.feed ),
            this.loadFromSource( this.discussions ),
        ] );

        return announcements.concat( forumPosts );
    }

    // Prefilled admin "add developer" deep link, matching the finder's contract.
    static buildAddDevUrl ( game, identifier, name ) {
        if ( !game || !identifier ) {
            return false;
        }

        const params = new URLSearchParams( {
            action: 'add-dev',
            game: game,
            identifier: identifier,
            name: name || identifier,
            service: 'Steam',
        } );

        return `${ ADMIN_HOST }/?${ params.toString() }`;
    }

    // The announcement RSS only gives a display name; the poster's account
    // identifier (vanity or SteamID64) lives in the announcement page byline.
    // Returns false when Steam doesn't expose it (group/store-attributed posts).
    static async resolveAnnouncerIdentifier ( announcementUrl, load ) {
        if ( !announcementUrl ) {
            return false;
        }

        let html = false;

        try {
            html = await load.get( announcementUrl );
        } catch ( announcementError ) {
            console.error( `[Steam] failed to load ${ announcementUrl }: ${ announcementError.message }` );
        }

        if ( !html ) {
            return false;
        }

        const href = cheerio.load( html )( '.announcement_byline .whiteLink' ).attr( 'href' );

        if ( !href ) {
            return false;
        }

        const match = href.match( /(?:id|profiles)\/(.+?)\/?$/ );

        return match ? match[ 1 ] : false;
    }

    // Notify at most once per marker; the permanent cache survives the 60s run
    // loop (and restarts) so we don't re-alert about the same untracked account.
    // `click` may be a value or a lazy async resolver, so any work needed to
    // build the tap action (e.g. fetching a page) is skipped once we've notified.
    static async notifyOnce ( marker, title, message, click ) {
        let alreadyNotified = false;

        try {
            alreadyNotified = await cache.get( marker );
        } catch ( cacheError ) {
            console.error( cacheError );
        }

        if ( alreadyNotified ) {
            return;
        }

        ntfy( {
            click: typeof click === 'function' ? await click() : click,
            message: message,
            title: title,
        } );

        try {
            await cache.store( marker, 'notified', true );
        } catch ( storeError ) {
            console.error( storeError );
        }
    }

    // Runs once per game after every tracked account has been indexed. Both Steam
    // sources are game-wide, so attribution is a cross-account question: content
    // we can't match to ANY tracked account means there's a studio/dev account we
    // should be tracking (much like finder discovering new accounts).
    static async afterIndex ( serviceConfig, serviceOptions, gameIdentifier, load ) {
        const appId = serviceOptions.allowedSections && serviceOptions.allowedSections[ 0 ];

        if ( !appId ) {
            return;
        }

        const cutoff = Math.floor( Date.now() / 1000 ) - ATTRIBUTION_WINDOW_SECONDS;

        await Steam.checkUntrackedAnnouncers( serviceConfig, gameIdentifier, appId, cutoff, load );
        await Steam.checkUntrackedForumDevs( serviceConfig, gameIdentifier, appId, cutoff, load );
    }

    // Announcement authors (display names) with no matching tracked persona.
    static async checkUntrackedAnnouncers ( serviceConfig, gameIdentifier, appId, cutoff, load ) {
        const endpoint = `https://steamcommunity.com/games/${ appId }/rss/`;

        let items = false;

        try {
            items = await new RSS( appId, { endpoint }, load ).loadRecentPosts();
        } catch ( feedError ) {
            console.error( feedError );
        }

        if ( !items || items.length === 0 ) {
            return;
        }

        // Author display name -> the announcement page where their identifier lives.
        const recentAnnouncers = new Map();

        for ( let i = 0; i < items.length; i = i + 1 ) {
            if ( items[ i ].author && ( !items[ i ].timestamp || items[ i ].timestamp >= cutoff ) ) {
                const author = items[ i ].author.trim();

                if ( !recentAnnouncers.has( author ) ) {
                    recentAnnouncers.set( author, items[ i ].url );
                }
            }
        }

        if ( recentAnnouncers.size === 0 ) {
            return;
        }

        const trackedPersonas = new Set();

        await Promise.all( serviceConfig.developers.map( async ( developer ) => {
            const persona = await SteamFeed.resolvePersonaName( developer.identifier, load );

            if ( persona ) {
                trackedPersonas.add( persona.toLowerCase() );
            }
        } ) );

        for ( const [ author, announcementUrl ] of recentAnnouncers ) {
            if ( trackedPersonas.has( author.toLowerCase() ) ) {
                continue;
            }

            await Steam.notifyOnce(
                `steam-unattributed-${ appId }-${ author }`,
                'Untracked Steam announcer',
                `"${ author }" posts announcements for ${ gameIdentifier } (app ${ appId }) but matches no tracked account. Consider adding them as a developer/studio account.`,
                // Prefer a prefilled add-dev link; fall back to the announcement
                // page when Steam doesn't expose the poster's account identifier.
                async () => {
                    const identifier = await Steam.resolveAnnouncerIdentifier( announcementUrl, load );

                    return Steam.buildAddDevUrl( gameIdentifier, identifier, author ) || announcementUrl;
                }
            );
        }
    }

    // Forum dev posts (Steam's developer badge) whose SteamID64 isn't tracked.
    static async checkUntrackedForumDevs ( serviceConfig, gameIdentifier, appId, cutoff, load ) {
        let devPosts = [];

        try {
            devPosts = await SteamDiscussions.extractDevPosts( appId, load );
        } catch ( crawlError ) {
            console.error( crawlError );

            return;
        }

        if ( devPosts.length === 0 ) {
            return;
        }

        // SteamID64 -> display name, for recent dev posts only.
        const recentDevs = new Map();

        for ( let i = 0; i < devPosts.length; i = i + 1 ) {
            if ( devPosts[ i ].timestamp >= cutoff ) {
                recentDevs.set( devPosts[ i ].steamId64, devPosts[ i ].author );
            }
        }

        if ( recentDevs.size === 0 ) {
            return;
        }

        const trackedSteamIds = new Set();

        await Promise.all( serviceConfig.developers.map( async ( developer ) => {
            const steamId64 = await SteamFeed.resolveSteamId64( developer.identifier, load );

            if ( steamId64 ) {
                trackedSteamIds.add( steamId64 );
            }
        } ) );

        for ( const [ steamId64, author ] of recentDevs ) {
            if ( trackedSteamIds.has( steamId64 ) ) {
                continue;
            }

            await Steam.notifyOnce(
                `steam-untracked-dev-${ appId }-${ steamId64 }`,
                'Untracked Steam developer',
                `"${ author }" (https://steamcommunity.com/profiles/${ steamId64 }) posts in ${ gameIdentifier }'s forums with a developer badge but matches no tracked account. Consider adding them.`,
                Steam.buildAddDevUrl( gameIdentifier, steamId64, author )
            );
        }
    }
}

module.exports = Steam;
