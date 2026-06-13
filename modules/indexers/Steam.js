const cheerio = require( 'cheerio' );

const RSS = require( './RSS.js' );
const SteamFeed = require( './SteamFeed' );
const SteamDiscussions = require( './SteamDiscussions' );
const cache = require( '../cache.js' );
const ntfy = require( '../ntfy.js' );

const ATTRIBUTION_WINDOW_SECONDS = 30 * 24 * 60 * 60;

// Re-alert cadence for an untracked account, matching the finder's default
// `0 */6 * * *` run schedule so reminders recur at the same rhythm.
const RENOTIFY_INTERVAL_SECONDS = 6 * 60 * 60;

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

    // Mirror the finder's notification body (finder/modules/ntfy.js buildBody):
    // one "key: value" line per field of the discovered account, instead of a
    // hand-written sentence, so the alert reads identically to a finder discovery.
    static formatBody ( fields ) {
        return Object.entries( fields )
            .map( ( [ key, value ] ) => `${ key }: ${ value }` )
            .join( '\n' );
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

    // Re-alert about the same untracked account, mirroring the finder: the finder
    // has no persistent "seen" state, so it re-notifies every run until the account
    // is tracked. We do the same, but throttled to the finder's run cadence
    // (RENOTIFY_INTERVAL_SECONDS) because the legacy indexer's ~60s run loop would
    // otherwise turn "re-notify every run" into a flood. The reminder stops on its
    // own once the account is tracked, since the upstream tracked-account filtering
    // drops it before we ever get here. The marker stores the unix timestamp of the
    // last alert and lives in the permanent cache so the throttle survives the 60s
    // cache sweep and restarts. `click` may be a value or a lazy async resolver, so
    // the work to build the tap action is skipped while inside the throttle window.
    static async notifyThrottled ( marker, title, message, click ) {
        let lastNotified = false;

        try {
            lastNotified = await cache.get( marker );
        } catch ( cacheError ) {
            console.error( cacheError );
        }

        const now = Math.floor( Date.now() / 1000 );

        if ( lastNotified && now - Number( lastNotified ) < RENOTIFY_INTERVAL_SECONDS ) {
            return;
        }

        ntfy( {
            click: typeof click === 'function' ? await click() : click,
            message: message,
            title: title,
        } );

        try {
            await cache.store( marker, String( now ), true );
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
            // Match the configured identifier itself, not just the resolved
            // persona — same as the indexer's SteamFeed (see SteamFeed.js). The
            // persona lookup fails or resolves to the wrong profile when the
            // vanity is private, gone, or coincidentally owned by someone else,
            // and many announcers post under a bare persona that IS the tracked
            // identifier. Without this, an already-tracked dev (e.g. "nilae")
            // gets re-flagged as untracked on every run.
            trackedPersonas.add( String( developer.identifier ).trim().toLowerCase() );

            const persona = await SteamFeed.resolvePersonaName( developer.identifier, load );

            if ( persona ) {
                trackedPersonas.add( persona.toLowerCase() );
            }
        } ) );

        for ( const [ author, announcementUrl ] of recentAnnouncers ) {
            if ( trackedPersonas.has( author.toLowerCase() ) ) {
                continue;
            }

            await Steam.notifyThrottled(
                `steam-unattributed-${ appId }-${ author }`,
                // Same title shape as the finder's discoveries (see finder/modules/ntfy.js),
                // so an untracked announcer reads as a "found a new developer" nudge.
                `Found a new developer for ${ gameIdentifier }, ${ author }`,
                Steam.formatBody( {
                    announcer: author,
                    game: gameIdentifier,
                    app: appId,
                } ),
                // Always hand back a prefilled add-dev link. Prefer the poster's
                // real account identifier from the announcement byline, but when
                // Steam doesn't expose it (group/store-attributed or JS-rendered
                // posts) fall back to the display name as the identifier — the
                // same thing the finder's SteamFeed does, and what the indexer's
                // SteamFeed matches announcement authors against. Never drop the
                // user on the announcement page, which can't add a developer.
                async () => {
                    const identifier = await Steam.resolveAnnouncerIdentifier( announcementUrl, load );

                    return Steam.buildAddDevUrl( gameIdentifier, identifier || author, author );
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

            await Steam.notifyThrottled(
                `steam-untracked-dev-${ appId }-${ steamId64 }`,
                // Match the finder's title shape (see finder/modules/ntfy.js) so badged
                // forum devs surface as the same "found a new developer" nudge.
                `Found a new developer for ${ gameIdentifier }, ${ author }`,
                Steam.formatBody( {
                    developer: author,
                    game: gameIdentifier,
                    profile: `https://steamcommunity.com/profiles/${ steamId64 }`,
                } ),
                Steam.buildAddDevUrl( gameIdentifier, steamId64, author )
            );
        }
    }
}

module.exports = Steam;
